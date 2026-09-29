import { useEffect, useId, useMemo, useState } from 'react';
import Loader from '../../components/Loader';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { catalogApi, providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { ProviderShell, PageHead, ErrorState } from './components/Shell';
import Field, { ErrorSummary } from './components/Field';
import ImageUpload from './components/ImageUpload';
import { ProviderStatusBanner } from './ProviderDashboard';
import useLoad, { fieldErrorsOf } from './lib/useLoad';
import { isCustomPolicy, policyPreview } from './lib/policy';

const FALLBACK_ZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Karachi', 'Asia/Dhaka',
  'Asia/Kathmandu', 'Asia/Colombo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Africa/Johannesburg', 'Africa/Nairobi', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland', 'UTC'
];

/** IANA zones from the browser (Intl.supportedValuesOf), else a short list; always includes `current`. */
export function timeZoneOptions(current) {
  let zones = [];
  try {
    zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    zones = [];
  }
  if (!zones.length) zones = FALLBACK_ZONES;
  const set = new Set(zones);
  if (current) set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Numeric settings with the ranges enforced by the API (ProviderRequest). */
export const RULES = {
  slotIntervalMin: [0, 480],
  maxBookingsPerDay: [0, 500],
  maxBookingsPerSlot: [1, 100],
  minNoticeMin: [0, 10080],
  maxAdvanceBookingDays: [1, 365],
  cancellationCutoffHours: [0, 720],
  lateCancelRefundPercent: [0, 100],
  rescheduleCutoffHours: [0, 720],
  maxReschedules: [0, 10]
};

const PHONE_RE = /^[+]?[0-9]{10,15}$/;

export function settingsToForm(me) {
  const p = me?.policy || {};
  const custom = isCustomPolicy(p);
  const str = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    businessName: me?.businessName || '', description: me?.description || '', specialty: me?.specialty || '',
    categoryId: me?.category?.id ? String(me.category.id) : '', address: me?.address || '', city: me?.city || '',
    state: me?.state || '', country: me?.country || '', phone: me?.phone || '', website: me?.website || '',
    latitude: str(me?.latitude), longitude: str(me?.longitude), logoUrl: me?.logoUrl || '', coverUrl: me?.coverUrl || '',
    timezone: me?.timezone || 'Asia/Kolkata',
    slotIntervalMin: str(p.slotIntervalMin ?? 0), maxBookingsPerDay: str(p.maxBookingsPerDay ?? 0),
    maxBookingsPerSlot: str(p.maxBookingsPerSlot ?? 1), minNoticeMin: str(p.minNoticeMin ?? 0),
    maxAdvanceBookingDays: str(p.maxAdvanceBookingDays ?? 30), autoConfirm: Boolean(p.autoConfirm),
    cancellationCutoffHours: str(p.cancellationCutoffHours ?? 24), lateCancelRefundPercent: str(p.lateCancelRefundPercent ?? 0),
    rescheduleCutoffHours: str(p.rescheduleCutoffHours ?? 12), maxReschedules: str(p.maxReschedules ?? 0),
    customPolicy: custom, cancellationPolicy: custom ? p.cancellationPolicy : ''
  };
}

export function validateSettings(form, t) {
  const e = {};
  if (!form.businessName.trim()) e.businessName = t('provider.settings.errors.businessName');
  if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) e.phone = t('provider.settings.errors.phone');
  if (form.website.trim() && !/^https?:\/\/\S+$/i.test(form.website.trim())) e.website = t('provider.settings.errors.website');
  const coord = (field, min, max) => {
    const v = form[field].trim();
    if (v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max)) e[field] = t('provider.settings.errors.range', { min, max });
  };
  coord('latitude', -90, 90);
  coord('longitude', -180, 180);
  Object.entries(RULES).forEach(([field, [min, max]]) => {
    const v = String(form[field]).trim();
    if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) e[field] = t('provider.settings.errors.range', { min, max });
  });
  if (form.customPolicy && !form.cancellationPolicy.trim()) e.cancellationPolicy = t('provider.settings.errors.policyText');
  return e;
}

export function settingsToPayload(form) {
  const text = (v) => v.trim();
  const numOrNull = (v) => (v.trim() === '' ? null : Number(v));
  return {
    businessName: text(form.businessName), description: text(form.description), specialty: text(form.specialty),
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    address: text(form.address), city: text(form.city), state: text(form.state), country: text(form.country),
    // the API validates the phone format and cannot store an empty one: omit it when blank
    phone: form.phone.trim() || null,
    website: text(form.website), logoUrl: form.logoUrl, coverUrl: form.coverUrl,
    latitude: numOrNull(form.latitude), longitude: numOrNull(form.longitude), timezone: form.timezone,
    ...Object.fromEntries(Object.keys(RULES).map((k) => [k, Number(form[k])])),
    autoConfirm: Boolean(form.autoConfirm),
    // blank = let the platform generate the text from the rules
    cancellationPolicy: form.customPolicy ? text(form.cancellationPolicy) : ''
  };
}

const ORDER = ['businessName', 'phone', 'website', 'latitude', 'longitude', ...Object.keys(RULES), 'cancellationPolicy'];

function BranchesSection() {
  const { t } = useI18n();
  const toast = useToast();
  const uid = useId();
  const id = (f) => `${uid}-${f}`;
  const branchesQ = useLoad(() => providerApi.branches(), []);
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', country: '', phone: '', main: false });
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const branches = branchesQ.data || [];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setNameError(t('provider.branches.nameRequired'));
      document.getElementById(id('name'))?.focus();
      return;
    }
    setNameError('');
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]));
      const saved = await providerApi.addBranch(payload);
      branchesQ.setData((list = []) => [...(saved.main ? list.map((b) => ({ ...b, main: false })) : list), saved]);
      setForm({ name: '', address: '', city: '', state: '', country: '', phone: '', main: false });
      toast(t('provider.branches.added', { name: saved.name }), 'success');
    } catch (err) {
      const fe = fieldErrorsOf(err);
      if (fe.name) setNameError(fe.name);
      setError(getErrorMessage(err, t('provider.common.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b) => {
    setDeleting(b.id);
    try {
      await providerApi.deleteBranch(b.id);
      branchesQ.setData((list = []) => list.filter((x) => x.id !== b.id));
      toast(t('provider.branches.removed', { name: b.name }), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('provider.common.saveFailed')), 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="card card-pad pp-section" aria-labelledby={id('title')}>
      <h2 className="pp-h2" id={id('title')}>{t('provider.branches.title')}</h2>
      <p className="pp-muted pp-section-lead">{t('provider.branches.lead')}</p>
      {branchesQ.error ? <ErrorState error={branchesQ.error} onRetry={branchesQ.reload} /> : branches.length === 0 ? (
        <p className="pp-muted">{branchesQ.data ? t('provider.branches.none') : t('provider.common.loading')}</p>
      ) : (
        <ul className="pp-branches">
          {branches.map((b) => (
            <li key={b.id} className="pp-branch">
              <div>
                <strong>{b.name}</strong>{b.main && <span className="badge badge-primary pp-ml">{t('provider.branches.main')}</span>}
                <div className="pp-cell-sub">{[b.address, b.city, b.state, b.country].filter(Boolean).join(', ')}{b.phone ? ` · ${b.phone}` : ''}</div>
              </div>
              <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => remove(b)} disabled={deleting === b.id}>
                {deleting === b.id ? t('provider.common.working') : t('provider.common.delete')}<span className="sr-only"> {b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="pp-branch-form" onSubmit={add} noValidate aria-labelledby={id('add')}>
        <h3 className="pp-h3" id={id('add')}>{t('provider.branches.add')}</h3>
        <div className="form-grid">
          <Field id={id('name')} label={t('provider.branches.name')} required error={nameError}>
            {(p) => <input {...p} value={form.name} maxLength={120} onChange={(e) => { set('name', e.target.value); setNameError(''); }} />}
          </Field>
          <Field id={id('phone')} label={t('provider.settings.fields.phone')} optional>
            {(p) => <input {...p} type="tel" value={form.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
        </div>
        <Field id={id('address')} label={t('provider.settings.fields.address')} optional>
          {(p) => <input {...p} value={form.address} maxLength={255} onChange={(e) => set('address', e.target.value)} />}
        </Field>
        <div className="pp-grid-3">
          <Field id={id('city')} label={t('provider.settings.fields.city')} optional>
            {(p) => <input {...p} value={form.city} maxLength={100} onChange={(e) => set('city', e.target.value)} />}
          </Field>
          <Field id={id('state')} label={t('provider.settings.fields.state')} optional>
            {(p) => <input {...p} value={form.state} maxLength={100} onChange={(e) => set('state', e.target.value)} />}
          </Field>
          <Field id={id('country')} label={t('provider.settings.fields.country')} optional>
            {(p) => <input {...p} value={form.country} maxLength={100} onChange={(e) => set('country', e.target.value)} />}
          </Field>
        </div>
        <label className="pp-check-inline">
          <input type="checkbox" checked={form.main} onChange={(e) => set('main', e.target.checked)} />
          <span>{t('provider.branches.makeMain')}</span>
        </label>
        {error && <p className="form-error mt-2" role="alert">{error}</p>}
        <div className="mt-2">
          <button type="submit" className="btn btn-outline btn-sm" disabled={busy}>{busy ? t('provider.common.saving') : t('provider.branches.addButton')}</button>
        </div>
      </form>
    </section>
  );
}

function NumberField({ id, name, label, hint, form, errors, set, suffix }) {
  const [min, max] = RULES[name];
  return (
    <Field id={id(name)} label={label} error={errors[name]} hint={hint}>
      {(p) => (
        <span className="pp-input-suffix">
          <input {...p} type="number" inputMode="numeric" min={min} max={max} value={form[name]} onChange={(e) => set(name, e.target.value)} />
          {suffix ? <span className="pp-suffix" aria-hidden="true">{suffix}</span> : null}
        </span>
      )}
    </Field>
  );
}

export default function ProviderSetting() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const uid = useId();
  const id = (f) => `${uid}-${f}`;
  const meQ = useLoad(() => providerApi.me(), []);
  const catsQ = useLoad(() => catalogApi.categories(), []);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (meQ.data && !form) setForm(settingsToForm(meQ.data));
  }, [meQ.data, form]);

  const zones = useMemo(() => timeZoneOptions(form?.timezone), [form?.timezone]);
  const localTime = useMemo(() => {
    if (!form?.timezone) return '';
    try {
      return new Intl.DateTimeFormat(locale, { timeZone: form.timezone, hour: 'numeric', minute: '2-digit', weekday: 'short' }).format(new Date());
    } catch {
      return '';
    }
  }, [form?.timezone, locale]);

  if (meQ.error && !meQ.data) {
    return <ProviderShell><PageHead title={t('provider.settings.title')} /><ErrorState error={meQ.error} onRetry={meQ.reload} /></ProviderShell>;
  }
  if (!form) return <ProviderShell><Loader label={t('provider.common.loading')} /></ProviderShell>;

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    if (status) setStatus('');
  };
  const labels = {
    businessName: t('provider.settings.fields.businessName'), description: t('provider.settings.fields.description'),
    specialty: t('provider.settings.fields.specialty'), phone: t('provider.settings.fields.phone'), website: t('provider.settings.fields.website'),
    latitude: t('provider.settings.fields.latitude'), longitude: t('provider.settings.fields.longitude'), timezone: t('provider.settings.fields.timezone'),
    ...Object.fromEntries(Object.keys(RULES).map((k) => [k, t(`provider.settings.fields.${k}`)])),
    cancellationPolicy: t('provider.settings.fields.cancellationPolicy')
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateSettings(form, t);
    setMessage('');
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage(t('provider.common.fixErrors'));
      setStatus('');
      const first = ORDER.find((f) => found[f]);
      if (first) document.getElementById(id(first))?.focus();
      return;
    }
    setBusy(true);
    setStatus(t('provider.common.saving'));
    try {
      const saved = await providerApi.updateMe(settingsToPayload(form));
      meQ.setData(saved);
      setForm(settingsToForm(saved));
      setErrors({});
      setStatus(t('provider.settings.saved'));
      toast(t('provider.settings.saved'), 'success');
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setErrors(fe);
      setMessage(getErrorMessage(err, t('provider.common.saveFailed')));
      setStatus('');
      const first = ORDER.find((f) => fe[f]);
      if (first) document.getElementById(id(first))?.focus();
    } finally {
      setBusy(false);
    }
  };

  const me = meQ.data;
  const preview = form.customPolicy ? form.cancellationPolicy.trim() : policyPreview(t, form);
  const numberProps = { id, form, errors, set };

  return (
    <ProviderShell>
      <PageHead title={t('provider.settings.title')} lead={t('provider.settings.lead')} />
      <ProviderStatusBanner status={me.status} note={me.adminNote} />

      <form onSubmit={submit} noValidate className="pp-settings">
        <section className="card card-pad pp-section" aria-labelledby={id('s-profile')}>
          <h2 className="pp-h2" id={id('s-profile')}>{t('provider.settings.sections.profile')}</h2>
          <div className="form-grid">
            <Field id={id('businessName')} label={labels.businessName} required error={errors.businessName}>
              {(p) => <input {...p} value={form.businessName} maxLength={120} onChange={(e) => set('businessName', e.target.value)} />}
            </Field>
            <Field id={id('specialty')} label={labels.specialty} optional error={errors.specialty} hint={t('provider.settings.hints.specialty')}>
              {(p) => <input {...p} value={form.specialty} maxLength={120} onChange={(e) => set('specialty', e.target.value)} />}
            </Field>
          </div>
          <Field id={id('categoryId')} label={t('provider.settings.fields.category')} error={errors.categoryId}>
            {(p) => (
              <select {...p} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                {!form.categoryId && <option value="">{t('provider.settings.chooseCategory')}</option>}
                {(catsQ.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field id={id('description')} label={labels.description} optional error={errors.description} hint={t('provider.settings.hints.description')}>
            {(p) => <textarea {...p} rows={4} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <div className="pp-uploads">
            <ImageUpload label={t('provider.settings.fields.logo')} value={form.logoUrl} onChange={(url) => set('logoUrl', url)} shape="square" />
            <ImageUpload label={t('provider.settings.fields.cover')} value={form.coverUrl} onChange={(url) => set('coverUrl', url)} />
          </div>
        </section>

        <section className="card card-pad pp-section" aria-labelledby={id('s-contact')}>
          <h2 className="pp-h2" id={id('s-contact')}>{t('provider.settings.sections.contact')}</h2>
          <Field id={id('address')} label={t('provider.settings.fields.address')} optional error={errors.address}>
            {(p) => <input {...p} value={form.address} maxLength={255} autoComplete="street-address" onChange={(e) => set('address', e.target.value)} />}
          </Field>
          <div className="pp-grid-3">
            <Field id={id('city')} label={t('provider.settings.fields.city')} optional error={errors.city}>
              {(p) => <input {...p} value={form.city} maxLength={100} onChange={(e) => set('city', e.target.value)} />}
            </Field>
            <Field id={id('state')} label={t('provider.settings.fields.state')} optional error={errors.state}>
              {(p) => <input {...p} value={form.state} maxLength={100} onChange={(e) => set('state', e.target.value)} />}
            </Field>
            <Field id={id('country')} label={t('provider.settings.fields.country')} optional error={errors.country}>
              {(p) => <input {...p} value={form.country} maxLength={100} onChange={(e) => set('country', e.target.value)} />}
            </Field>
          </div>
          <div className="form-grid">
            <Field id={id('phone')} label={labels.phone} optional error={errors.phone} hint={t('provider.settings.hints.phone')}>
              {(p) => <input {...p} type="tel" autoComplete="tel" value={form.phone} maxLength={16} onChange={(e) => set('phone', e.target.value)} />}
            </Field>
            <Field id={id('website')} label={labels.website} optional error={errors.website} hint={t('provider.settings.hints.website')}>
              {(p) => <input {...p} type="url" value={form.website} maxLength={200} placeholder="https://" onChange={(e) => set('website', e.target.value)} />}
            </Field>
          </div>
          <div className="form-grid">
            <Field id={id('latitude')} label={labels.latitude} optional error={errors.latitude} hint={t('provider.settings.hints.coords')}>
              {(p) => <input {...p} inputMode="decimal" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} />}
            </Field>
            <Field id={id('longitude')} label={labels.longitude} optional error={errors.longitude}>
              {(p) => <input {...p} inputMode="decimal" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} />}
            </Field>
          </div>
        </section>

        <section className="card card-pad pp-section" aria-labelledby={id('s-rules')}>
          <h2 className="pp-h2" id={id('s-rules')}>{t('provider.settings.sections.rules')}</h2>
          <Field id={id('timezone')} label={labels.timezone} error={errors.timezone}
            hint={localTime ? t('provider.settings.hints.timezoneNow', { time: localTime }) : t('provider.settings.hints.timezone')}>
            {(p) => (
              <select {...p} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
              </select>
            )}
          </Field>
          <div className="form-grid">
            <NumberField {...numberProps} name="slotIntervalMin" label={labels.slotIntervalMin} hint={t('provider.settings.hints.slotIntervalMin')} suffix={t('provider.common.minShort')} />
            <NumberField {...numberProps} name="minNoticeMin" label={labels.minNoticeMin} hint={t('provider.settings.hints.minNoticeMin')} suffix={t('provider.common.minShort')} />
            <NumberField {...numberProps} name="maxAdvanceBookingDays" label={labels.maxAdvanceBookingDays} hint={t('provider.settings.hints.maxAdvanceBookingDays')} suffix={t('provider.common.daysShort')} />
            <NumberField {...numberProps} name="maxBookingsPerDay" label={labels.maxBookingsPerDay} hint={t('provider.settings.hints.maxBookingsPerDay')} />
            <NumberField {...numberProps} name="maxBookingsPerSlot" label={labels.maxBookingsPerSlot} hint={t('provider.settings.hints.maxBookingsPerSlot')} />
          </div>
          <label className="pp-check-inline pp-toggle-row">
            <input type="checkbox" checked={form.autoConfirm} onChange={(e) => set('autoConfirm', e.target.checked)} aria-describedby={id('auto-hint')} />
            <span>
              <strong>{t('provider.settings.fields.autoConfirm')}</strong>
              <span className="hint" id={id('auto-hint')}>{t('provider.settings.hints.autoConfirm')}</span>
            </span>
          </label>
        </section>

        <section className="card card-pad pp-section" aria-labelledby={id('s-policy')}>
          <h2 className="pp-h2" id={id('s-policy')}>{t('provider.settings.sections.policy')}</h2>
          <div className="form-grid">
            <NumberField {...numberProps} name="cancellationCutoffHours" label={labels.cancellationCutoffHours} hint={t('provider.settings.hints.cancellationCutoffHours')} suffix={t('provider.common.hoursShort')} />
            <NumberField {...numberProps} name="lateCancelRefundPercent" label={labels.lateCancelRefundPercent} hint={t('provider.settings.hints.lateCancelRefundPercent')} suffix="%" />
            <NumberField {...numberProps} name="rescheduleCutoffHours" label={labels.rescheduleCutoffHours} hint={t('provider.settings.hints.rescheduleCutoffHours')} suffix={t('provider.common.hoursShort')} />
            <NumberField {...numberProps} name="maxReschedules" label={labels.maxReschedules} hint={t('provider.settings.hints.maxReschedules')} />
          </div>
          <fieldset className="pp-fieldset">
            <legend className="field-label">{t('provider.settings.policyTextLegend')}</legend>
            <div className="pp-radios">
              <label className="pp-radio">
                <input type="radio" name={id('policy-mode')} checked={!form.customPolicy} onChange={() => set('customPolicy', false)} />
                <span><strong>{t('provider.settings.policyAuto')}</strong><span className="hint">{t('provider.settings.policyAutoHint')}</span></span>
              </label>
              <label className="pp-radio">
                <input type="radio" name={id('policy-mode')} checked={form.customPolicy} onChange={() => set('customPolicy', true)} />
                <span><strong>{t('provider.settings.policyCustom')}</strong><span className="hint">{t('provider.settings.policyCustomHint')}</span></span>
              </label>
            </div>
          </fieldset>
          {form.customPolicy && (
            <Field id={id('cancellationPolicy')} label={labels.cancellationPolicy} required error={errors.cancellationPolicy}
              hint={t('provider.settings.hints.cancellationPolicy', { count: 500 - form.cancellationPolicy.length })}>
              {(p) => <textarea {...p} rows={3} maxLength={500} value={form.cancellationPolicy} onChange={(e) => set('cancellationPolicy', e.target.value)} />}
            </Field>
          )}
          <div className="pp-preview">
            <span className="pp-preview-label">{t('provider.settings.previewLabel')}</span>
            <p className="pp-preview-text">{preview || <span className="pp-muted">{t('provider.settings.previewEmpty')}</span>}</p>
          </div>
        </section>

        <div className="pp-savebar">
          <ErrorSummary message={message} errors={message ? errors : {}} labels={labels} />
          <div className="pp-savebar-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('provider.common.saving') : t('provider.settings.save')}</button>
            <p className="pp-save-status" role="status" aria-live="polite">{status}</p>
          </div>
        </div>
      </form>

      <BranchesSection />
    </ProviderShell>
  );
}
