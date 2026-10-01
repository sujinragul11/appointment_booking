import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { catalogApi, providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { formatMoney } from '../../utils/format';
import { ProviderShell, PageHead, ErrorState, EmptyState, SectionLoading } from './components/Shell';
import Field, { ErrorSummary } from './components/Field';
import ImageUpload from './components/ImageUpload';
import useLoad, { fieldErrorsOf } from './lib/useLoad';

<<<<<<< HEAD
export const SERVICE_MODES = ['IN_PERSON', 'ONLINE', 'BOTH'];
=======
const EMPTY = { name: '', description: '', durationMin: 30, bufferMin: 10, price: '', categoryId: '', imageUrl: '', active: true, staffIds: [] };
>>>>>>> a52368e (backendcommit)

const EMPTY = {
  name: '', description: '', categoryId: '', durationMin: '30', bufferMin: '10', price: '', depositPercent: '0',
  mode: 'IN_PERSON', maxAdvanceBookingDays: '0', imageUrl: '', active: true, staffIds: []
};

/** Form state for a service. The API reports the effective booking window, so a value equal
 * to the provider default is shown as 0 ("use the business default"). */
export function serviceToForm(s, providerDefaultDays) {
  if (!s) return { ...EMPTY, staffIds: [] };
  const days = Number(s.maxAdvanceBookingDays) || 0;
  return {
    name: s.name || '',
    description: s.description || '',
    categoryId: s.categoryId ? String(s.categoryId) : '',
    durationMin: String(s.durationMin ?? ''),
    bufferMin: String(s.bufferMin ?? 0),
    price: String(s.price ?? ''),
    depositPercent: String(s.depositPercent ?? 0),
    mode: s.mode || 'IN_PERSON',
    maxAdvanceBookingDays: String(providerDefaultDays && days === Number(providerDefaultDays) ? 0 : days),
    imageUrl: s.imageUrl || '',
    active: s.active !== false,
    staffIds: [...(s.staffIds || [])]
  };
}

const isInt = (v) => /^\d+$/.test(String(v).trim());

/** Client-side checks mirroring ServiceRequest's constraints; returns { field: message }. */
export function validateService(form, t) {
  const e = {};
  const range = (field, min, max) => {
    const v = String(form[field]).trim();
    if (v === '' || !isInt(v) || Number(v) < min || Number(v) > max) e[field] = t('provider.services.errors.range', { min, max });
  };
  if (!form.name.trim()) e.name = t('provider.services.errors.name');
  else if (form.name.trim().length > 120) e.name = t('provider.services.errors.nameLength');
  range('durationMin', 5, 480);
  range('bufferMin', 0, 120);
  const price = String(form.price).trim();
  if (price === '' || !Number.isFinite(Number(price)) || Number(price) < 0) e.price = t('provider.services.errors.price');
  range('depositPercent', 0, 100);
  range('maxAdvanceBookingDays', 0, 365);
  return e;
}

export function serviceToPayload(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    durationMin: Number(form.durationMin),
    bufferMin: Number(form.bufferMin),
    price: Number(form.price),
    depositPercent: Number(form.depositPercent),
    mode: form.mode,
    maxAdvanceBookingDays: Number(form.maxAdvanceBookingDays),
    imageUrl: form.imageUrl || '',
    active: Boolean(form.active),
    staffIds: form.staffIds.map(Number)
  };
}

const FIELD_ORDER = ['name', 'categoryId', 'durationMin', 'bufferMin', 'price', 'depositPercent', 'maxAdvanceBookingDays', 'mode', 'staffIds'];

function ServiceForm({ service, staff, categories, providerDefaultDays, onSaved, onClose }) {
  const { t } = useI18n();
  const uid = useId();
  const id = (f) => `${uid}-${f}`;
  const [form, setForm] = useState(() => serviceToForm(service, providerDefaultDays));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const toggleStaff = (sid, on) => set('staffIds', on ? [...form.staffIds, sid] : form.staffIds.filter((x) => x !== sid));

  const labels = {
    name: t('provider.services.fields.name'), description: t('provider.services.fields.description'),
    categoryId: t('provider.services.fields.category'), durationMin: t('provider.services.fields.duration'),
    bufferMin: t('provider.services.fields.buffer'), price: t('provider.services.fields.price'),
    depositPercent: t('provider.services.fields.deposit'), maxAdvanceBookingDays: t('provider.services.fields.advance'),
    mode: t('provider.services.fields.mode'), imageUrl: t('provider.services.fields.image'), staffIds: t('provider.services.fields.staff')
  };

  const focusFirst = (errs) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) document.getElementById(id(first))?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateService(form, t);
    setMessage('');
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage(t('provider.common.fixErrors'));
      focusFirst(found);
      return;
    }
    setBusy(true);
    try {
      const payload = serviceToPayload(form);
      const saved = service ? await providerApi.updateService(service.id, payload) : await providerApi.createService(payload);
      onSaved(saved, !service);
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setErrors(fe);
      setMessage(getErrorMessage(err, t('provider.common.saveFailed')));
      focusFirst(fe);
    } finally {
      setBusy(false);
    }
  };

  const activeStaff = staff.filter((s) => s.active || form.staffIds.includes(s.id));

  return (
    <Modal title={service ? t('provider.services.editTitle', { name: service.name }) : t('provider.services.addTitle')} onClose={onClose}
      wide closeDisabled={busy} closeOnBackdrop={false}>
      <form onSubmit={submit} noValidate className="pp-form">
        <Field id={id('name')} label={labels.name} required error={errors.name}>
          {(p) => <input {...p} value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} autoComplete="off" />}
        </Field>
        <Field id={id('description')} label={labels.description} optional error={errors.description} hint={t('provider.services.hints.description')}>
          {(p) => <textarea {...p} rows={3} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <div className="form-grid">
          <Field id={id('categoryId')} label={labels.categoryId} error={errors.categoryId}>
            {(p) => (
              <select {...p} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">{t('provider.services.noCategory')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field id={id('price')} label={labels.price} required error={errors.price} hint={t('provider.services.hints.price')}>
            {(p) => <input {...p} type="number" inputMode="decimal" min={0} step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} />}
          </Field>
        </div>
        <div className="form-grid">
          <Field id={id('durationMin')} label={labels.durationMin} required error={errors.durationMin} hint={t('provider.services.hints.duration')}>
            {(p) => <input {...p} type="number" inputMode="numeric" min={5} max={480} step={5} value={form.durationMin} onChange={(e) => set('durationMin', e.target.value)} />}
          </Field>
          <Field id={id('bufferMin')} label={labels.bufferMin} error={errors.bufferMin} hint={t('provider.services.hints.buffer')}>
            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={120} step={5} value={form.bufferMin} onChange={(e) => set('bufferMin', e.target.value)} />}
          </Field>
        </div>
        <div className="form-grid">
          <Field id={id('depositPercent')} label={labels.depositPercent} error={errors.depositPercent} hint={t('provider.services.hints.deposit')}>
            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={100} value={form.depositPercent} onChange={(e) => set('depositPercent', e.target.value)} />}
          </Field>
          <Field id={id('maxAdvanceBookingDays')} label={labels.maxAdvanceBookingDays} error={errors.maxAdvanceBookingDays}
            hint={providerDefaultDays ? t('provider.services.hints.advanceDefault', { days: providerDefaultDays }) : t('provider.services.hints.advance')}>
            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={365} value={form.maxAdvanceBookingDays} onChange={(e) => set('maxAdvanceBookingDays', e.target.value)} />}
          </Field>
        </div>

        <fieldset className="pp-fieldset">
          <legend className="field-label">{labels.mode}</legend>
          <div className="pp-radios">
            {SERVICE_MODES.map((m) => (
              <label key={m} className="pp-radio">
                <input type="radio" id={form.mode === m ? id('mode') : undefined} name={id('mode')} value={m} checked={form.mode === m} onChange={() => set('mode', m)} />
                <span><strong>{t(`provider.mode.${m}`)}</strong><span className="hint">{t(`provider.services.modeHints.${m}`)}</span></span>
              </label>
            ))}
          </div>
          {errors.mode && <p className="hint error-text">{errors.mode}</p>}
        </fieldset>

        <ImageUpload label={labels.imageUrl} value={form.imageUrl} onChange={(url) => set('imageUrl', url)} hint={t('provider.services.hints.image')} />

        <fieldset className="pp-fieldset">
          <legend className="field-label">{labels.staffIds}</legend>
          <p className="hint" id={id('staff-hint')}>{t('provider.services.hints.staff')}</p>
          {activeStaff.length === 0 ? (
            <p className="pp-muted">{t('provider.services.noStaff')}</p>
          ) : (
            <div className="pp-checks">
              {activeStaff.map((s, i) => (
                <label key={s.id} className="pp-check-inline">
                  <input type="checkbox" id={i === 0 ? id('staffIds') : undefined} checked={form.staffIds.includes(s.id)}
                    onChange={(e) => toggleStaff(s.id, e.target.checked)} aria-describedby={id('staff-hint')} />
                  <span>{s.name}{s.designation ? <span className="pp-muted"> · {s.designation}</span> : null}</span>
                </label>
              ))}
            </div>
<<<<<<< HEAD
          )}
          {errors.staffIds && <p className="hint error-text">{errors.staffIds}</p>}
        </fieldset>

        <label className="pp-check-inline pp-active-check">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <span>{t('provider.services.fields.active')}</span>
        </label>

        <ErrorSummary message={message} errors={message ? errors : {}} labels={labels} />
        <div className="pp-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('provider.common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('provider.common.saving') : service ? t('provider.common.saveChanges') : t('provider.services.create')}
          </button>
        </div>
      </form>
    </Modal>
=======
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="field"><label>Duration (min)</label><input type="number" min={5} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} required /></div>
              <div className="field"><label>Buffer (min)</label><input type="number" min={0} value={form.bufferMin} onChange={(e) => setForm({ ...form, bufferMin: e.target.value })} /></div>
              <div className="field"><label>Price ({'\u20B9'})</label><input type="number" min={0.01} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></div>
            </div>
            <div className="field">
              <label>Team members who offer this</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {staff.map((st) => (
                  <label key={st.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={(form.staffIds || []).includes(st.id)}
                      onChange={(e) => setForm({ ...form, staffIds: e.target.checked ? [...(form.staffIds || []), st.id] : (form.staffIds || []).filter((x) => x !== st.id) })} />
                    {st.name}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active (bookable)
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : (editing ? 'Update' : 'Add service')}</button>
          </form>
        </Modal>
      )}
    </div>
>>>>>>> a52368e (backendcommit)
  );
}

export default function ProviderServices() {
  const { t } = useI18n();
  const toast = useToast();
  const servicesQ = useLoad(() => providerApi.services(), []);
  const staffQ = useLoad(() => providerApi.staff(), []);
  const catsQ = useLoad(() => catalogApi.categories(), []);
  const meQ = useLoad(() => providerApi.me(), []);
  const [editing, setEditing] = useState(null); // null | 'new' | service
  const [toggling, setToggling] = useState(null);

  const services = servicesQ.data || [];
  const staff = staffQ.data || [];
  const providerDefaultDays = meQ.data?.policy?.maxAdvanceBookingDays;

  const onSaved = (saved, created) => {
    servicesQ.setData((list = []) => (created ? [...list, saved] : list.map((s) => (s.id === saved.id ? saved : s)))
      .sort((a, b) => a.name.localeCompare(b.name)));
    toast(created ? t('provider.services.created', { name: saved.name }) : t('provider.services.updated', { name: saved.name }), 'success');
    setEditing(null);
  };

  const toggle = async (s) => {
    setToggling(s.id);
    try {
      const saved = await providerApi.setServiceActive(s.id, !s.active);
      servicesQ.setData((list = []) => list.map((x) => (x.id === saved.id ? saved : x)));
      toast(saved.active ? t('provider.services.enabled', { name: saved.name }) : t('provider.services.disabled', { name: saved.name }), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('provider.common.saveFailed')), 'error');
    } finally {
      setToggling(null);
    }
  };

  const staffNames = (s) => (s.staffNames && s.staffNames.length ? s.staffNames.join(', ') : t('provider.services.anyone'));

  return (
    <ProviderShell>
      <PageHead title={t('provider.services.title')} lead={t('provider.services.lead')}
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <span aria-hidden="true">+ </span>{t('provider.services.add')}</button>} />

      {servicesQ.error ? <ErrorState error={servicesQ.error} onRetry={servicesQ.reload} /> : !servicesQ.data ? <SectionLoading /> : services.length === 0 ? (
        <EmptyState title={t('provider.services.empty')} text={t('provider.services.emptyText')}
          action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>{t('provider.services.add')}</button>} />
      ) : (
        <div className="card table-wrap">
          <table className="table pp-table">
            <caption className="sr-only">{t('provider.services.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('provider.services.cols.service')}</th>
                <th scope="col">{t('provider.services.cols.duration')}</th>
                <th scope="col">{t('provider.services.cols.price')}</th>
                <th scope="col">{t('provider.services.cols.mode')}</th>
                <th scope="col">{t('provider.services.cols.team')}</th>
                <th scope="col">{t('provider.services.cols.bookable')}</th>
                <th scope="col"><span className="sr-only">{t('provider.common.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'pp-row-off'}>
                  <td>
                    <div className="pp-svc">
                      {s.imageUrl ? <img className="pp-svc-img" src={s.imageUrl} alt="" /> : <span className="pp-svc-img pp-svc-ph" aria-hidden="true">{s.name.charAt(0)}</span>}
                      <div>
                        <strong>{s.name}</strong>
                        <div className="pp-cell-sub">{s.categoryName || t('provider.services.noCategory')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="pp-nowrap">
                    {t('provider.services.minutes', { count: s.durationMin })}
                    {s.bufferMin ? <div className="pp-cell-sub">{t('provider.services.plusBuffer', { count: s.bufferMin })}</div> : null}
                  </td>
                  <td className="pp-nowrap">
                    {formatMoney(s.price)}
                    {s.depositPercent > 0 && s.depositPercent < 100 ? <div className="pp-cell-sub">{t('provider.services.depositShort', { percent: s.depositPercent })}</div> : null}
                  </td>
                  <td>{t(`provider.mode.${s.mode || 'IN_PERSON'}`)}</td>
                  <td className="pp-cell-wrap">{staffNames(s)}</td>
                  <td>
                    <label className="switch">
                      <input type="checkbox" role="switch" checked={s.active} disabled={toggling === s.id} onChange={() => toggle(s)} />
                      <span className="switch-track"><span className="switch-thumb" /></span>
                      <span className="sr-only">{t('provider.services.bookableName', { name: s.name })}</span>
                      <span className="pp-switch-text" aria-hidden="true">{s.active ? t('provider.services.on') : t('provider.services.off')}</span>
                    </label>
                  </td>
                  <td>
                    <button type="button" className="btn btn-outline btn-xs" onClick={() => setEditing(s)}>
                      {t('provider.common.edit')}<span className="sr-only"> {s.name}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {servicesQ.data && services.length > 0 && (
        <p className="pp-muted mt-2">{t('provider.services.count', { count: services.length, active: services.filter((s) => s.active).length })}</p>
      )}

      {editing && (
        <ServiceForm service={editing === 'new' ? null : editing} staff={staff} categories={catsQ.data || []}
          providerDefaultDays={providerDefaultDays} onSaved={onSaved} onClose={() => setEditing(null)} />
      )}
    </ProviderShell>
  );
}
