import { useId, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { useToast } from '../../../components/Toast';
import { getErrorMessage } from '../../../api/client';
import { availabilityApi } from '../../../api/provider';
import { blockKind, blockPayload, validateBlock } from '../lib/availability';
import { fmtDate, fmtTime } from '../lib/time';
import { fieldErrorsOf } from '../lib/useLoad';

const KINDS = ['closed', 'partial', 'custom'];

/**
 * Blocked dates / custom hours for specific dates (FR-15): add a whole-day closure (holiday,
 * leave), a closed time range, or custom working hours; list upcoming entries with delete.
 * `scopes` = [{ value: '' | staffId, label }] the entry can apply to (first = default).
 * `canDelete(entry)` decides which entries this viewer may remove.
 */
export default function BlockedDates({ entries = [], scopes, today, onChange, canDelete = () => true, scopeLabel, idPrefix = 'blk' }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const uid = useId();
  const id = (name) => `${idPrefix}-${name}`;
  const [form, setForm] = useState(() => ({ date: '', staffId: scopes?.[0]?.value ?? '', kind: 'closed', startTime: '09:00', endTime: '13:00', reason: '' }));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k] || (k.endsWith('Time') && errors.time)) setErrors((e) => ({ ...e, [k]: undefined, time: k.endsWith('Time') ? undefined : e.time }));
  };

  const upcoming = useMemo(() => entries
    .filter((b) => !today || String(b.date) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startTime || '').localeCompare(String(b.startTime || ''))),
  [entries, today]);

  const scopeName = (staffId) => {
    const match = scopes?.find((s) => String(s.value) === String(staffId ?? ''));
    return match ? match.label : (scopeLabel ? scopeLabel(staffId) : '');
  };

  const describe = (b) => {
    const kind = blockKind(b);
    const range = b.startTime ? `${fmtTime(b.startTime, locale)} – ${fmtTime(b.endTime, locale)}` : '';
    if (kind === 'custom') return t('provider.blocked.kindCustomAt', { range });
    if (kind === 'partial') return t('provider.blocked.kindPartialAt', { range });
    return t('provider.blocked.kindClosed');
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateBlock(form, today);
    setServerError('');
    if (Object.keys(found).length) {
      setErrors(found);
      const first = found.date ? id('date') : id('start');
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    try {
      const created = await availabilityApi.block(blockPayload(form));
      // The backend keeps one entry per date and resource: drop the replaced one.
      onChange([...entries.filter((b) => !(b.date === created.date && String(b.staffId ?? '') === String(created.staffId ?? ''))), created]);
      toast(t('provider.blocked.added', { date: fmtDate(created.date, locale) }), 'success');
      setForm((f) => ({ ...f, date: '', reason: '' }));
      setErrors({});
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setErrors({ date: fe.date, time: fe.validRange || fe.startTime || fe.endTime });
      setServerError(getErrorMessage(err, t('provider.common.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b) => {
    setDeleting(b.id);
    try {
      await availabilityApi.unblock(b.id);
      onChange(entries.filter((x) => x.id !== b.id));
      toast(t('provider.blocked.removed', { date: fmtDate(b.date, locale) }), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('provider.common.saveFailed')), 'error');
    } finally {
      setDeleting(null);
    }
  };

  const errText = (field) => {
    const code = errors[field];
    if (!code) return null;
    return ['required', 'past', 'order'].includes(code) ? t(`provider.blocked.errors.${field}.${code}`) : code;
  };

  return (
    <div className="blk">
      <form className="card card-pad blk-form" onSubmit={submit} noValidate aria-labelledby={`${uid}-title`}>
        <h3 className="pp-h3" id={`${uid}-title`}>{t('provider.blocked.addTitle')}</h3>
        <div className="blk-grid">
          <div className="field">
            <label htmlFor={id('date')}>{t('provider.blocked.date')}<span className="pp-req" aria-hidden="true"> *</span></label>
            <input id={id('date')} type="date" min={today} value={form.date} required
              aria-invalid={errors.date ? true : undefined} aria-describedby={errors.date ? id('date-err') : undefined}
              onChange={(e) => set('date', e.target.value)} />
            {errors.date && <span className="hint error-text" id={id('date-err')}>{errText('date')}</span>}
          </div>
          {scopes && scopes.length > 1 && (
            <div className="field">
              <label htmlFor={id('scope')}>{t('provider.blocked.appliesTo')}</label>
              <select id={id('scope')} value={form.staffId} onChange={(e) => set('staffId', e.target.value)}>
                {scopes.map((s) => <option key={String(s.value)} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
        </div>

        <fieldset className="blk-kinds">
          <legend className="field-label">{t('provider.blocked.kind')}</legend>
          {KINDS.map((k) => (
            <label key={k} className="blk-kind">
              <input type="radio" name={id('kind')} value={k} checked={form.kind === k} onChange={() => set('kind', k)} />
              <span>
                <strong>{t(`provider.blocked.kinds.${k}`)}</strong>
                <span className="hint">{t(`provider.blocked.kindHints.${k}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {form.kind !== 'closed' && (
          <div className="blk-grid">
            <div className="field">
              <label htmlFor={id('start')}>{t('provider.availability.from')}</label>
              <input id={id('start')} type="time" step={300} value={form.startTime}
                aria-invalid={errors.time ? true : undefined} aria-describedby={errors.time ? id('time-err') : undefined}
                onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={id('end')}>{t('provider.availability.to')}</label>
              <input id={id('end')} type="time" step={300} value={form.endTime}
                aria-invalid={errors.time ? true : undefined} aria-describedby={errors.time ? id('time-err') : undefined}
                onChange={(e) => set('endTime', e.target.value)} />
            </div>
            {errors.time && <p className="hint error-text blk-span" id={id('time-err')}>{errText('time')}</p>}
          </div>
        )}

        <div className="field">
          <label htmlFor={id('reason')}>{t('provider.blocked.reason')} <span className="pp-opt">({t('provider.common.optional')})</span></label>
          <input id={id('reason')} maxLength={255} value={form.reason} placeholder={t('provider.blocked.reasonPlaceholder')}
            onChange={(e) => set('reason', e.target.value)} aria-describedby={id('reason-hint')} />
          <span className="hint" id={id('reason-hint')}>{t('provider.blocked.reasonHint')}</span>
        </div>

        {serverError && <p className="form-error" role="alert">{serverError}</p>}
        <div className="blk-submit">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? t('provider.common.saving') : t('provider.blocked.add')}</button>
          <span className="hint">{t('provider.blocked.replaceNote')}</span>
        </div>
      </form>

      <h3 className="pp-h3 mt-3">{t('provider.blocked.upcoming')}</h3>
      {upcoming.length === 0 ? (
        <p className="pp-muted">{t('provider.blocked.none')}</p>
      ) : (
        <div className="card table-wrap">
          <table className="table pp-table">
            <caption className="sr-only">{t('provider.blocked.upcoming')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('provider.blocked.date')}</th>
                <th scope="col">{t('provider.blocked.appliesTo')}</th>
                <th scope="col">{t('provider.blocked.kind')}</th>
                <th scope="col">{t('provider.blocked.reason')}</th>
                <th scope="col"><span className="sr-only">{t('provider.common.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((b) => (
                <tr key={b.id}>
                  <td><strong>{fmtDate(b.date, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong></td>
                  <td>{scopeName(b.staffId)}</td>
                  <td><span className={`blk-badge blk-${blockKind(b)}`}>{describe(b)}</span></td>
                  <td>{b.reason || <span className="pp-muted">—</span>}</td>
                  <td className="pp-cell-actions">
                    {canDelete(b) ? (
                      <button type="button" className="btn btn-danger-outline btn-xs" disabled={deleting === b.id} onClick={() => remove(b)}>
                        {deleting === b.id ? t('provider.common.working') : t('provider.common.delete')}
                        <span className="sr-only"> {fmtDate(b.date, locale)}</span>
                      </button>
                    ) : <span className="pp-muted">{t('provider.blocked.readOnly')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
