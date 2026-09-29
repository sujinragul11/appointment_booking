import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import {
  assignService, createService, deleteService, fetchCategories, fetchServices, setServiceActive, updateService, uploadImage
} from '../../api/admin';
import AdminLayout from './AdminLayout';
import ProviderPicker from './ProviderPicker';
import { ConfirmDialog, DataState, Field, FilterSelect, Pager, SearchBox, TableWrap, fieldErrors } from './adminUi';
import { useAdminFormat, useLoader, usePlural, useUrlFilters } from './adminHooks';

const PAGE_SIZE = 20;
const DEFAULTS = { q: '', categoryId: '', providerId: '', providerName: '', active: '', mode: '', page: 0 };
export const MODES = ['IN_PERSON', 'ONLINE', 'BOTH'];
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/;
const IMAGE_MAX = 2 * 1024 * 1024;

const EMPTY_FORM = {
  provider: null, name: '', description: '', categoryId: '', mode: 'IN_PERSON', durationMin: '30', bufferMin: '0',
  price: '0', depositPercent: '0', maxAdvanceBookingDays: '0', imageUrl: '', active: true
};

export function serviceForm(service) {
  if (!service) return { ...EMPTY_FORM };
  return {
    provider: service.providerId ? { id: service.providerId, name: service.providerName } : null,
    name: service.name || '',
    description: service.description || '',
    categoryId: service.categoryId ? String(service.categoryId) : '',
    mode: service.mode || 'IN_PERSON',
    durationMin: String(service.durationMin ?? 30),
    bufferMin: String(service.bufferMin ?? 0),
    price: String(service.price ?? 0),
    depositPercent: String(service.depositPercent ?? 0),
    maxAdvanceBookingDays: String(service.maxAdvanceBookingDays ?? 0),
    imageUrl: service.imageUrl || '',
    active: service.active !== false
  };
}

const isInt = (v) => /^\d+$/.test(String(v).trim());
const inRange = (v, lo, hi) => isInt(v) && Number(v) >= lo && Number(v) <= hi;

/** Client-side checks mirroring ServiceRequest's constraints. Returns { field: i18nKey }. */
export function validateService(form) {
  const errors = {};
  if (!form.provider?.id) errors.providerId = 'admin.services.errProvider';
  if (!form.name.trim() || form.name.trim().length > 120) errors.name = 'admin.services.errName';
  if (form.description.length > 5000) errors.description = 'admin.services.errDescription';
  if (!inRange(form.durationMin, 5, 480)) errors.durationMin = 'admin.services.errDuration';
  if (!inRange(form.bufferMin, 0, 120)) errors.bufferMin = 'admin.services.errBuffer';
  if (String(form.price).trim() === '' || !(Number(form.price) >= 0)) errors.price = 'admin.services.errPrice';
  if (!inRange(form.depositPercent, 0, 100)) errors.depositPercent = 'admin.services.errDeposit';
  if (!inRange(form.maxAdvanceBookingDays, 0, 365)) errors.maxAdvanceBookingDays = 'admin.services.errAdvance';
  return errors;
}

/**
 * ServiceRequest body for POST /admin/services or PUT /admin/services/{id}. A different
 * providerId on update re-assigns the service. staffIds is never sent (null keeps the team).
 */
export function servicePayload(form, original) {
  const payload = {
    providerId: form.provider?.id ?? null,
    name: form.name.trim(),
    description: form.description.trim() || null,
    durationMin: Number(form.durationMin),
    bufferMin: Number(form.bufferMin || 0),
    price: Number(form.price || 0),
    depositPercent: Number(form.depositPercent || 0),
    mode: form.mode,
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    // '' removes an existing image, null leaves the field alone
    imageUrl: form.imageUrl ? form.imageUrl : original?.imageUrl ? '' : null,
    active: Boolean(form.active)
  };
  // The API reports the *effective* booking window (the service's own value or the provider
  // default), so re-sending an untouched value would pin the provider default onto the
  // service. Only send it on create or when it was changed.
  const advance = Number(form.maxAdvanceBookingDays || 0);
  if (!original || advance !== Number(original.maxAdvanceBookingDays ?? 0)) payload.maxAdvanceBookingDays = advance;
  return payload;
}

/** Services (FR-9..11): browse all services, create / edit / re-assign, copy to a provider, enable / disable, delete. */
export default function AdminServices() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const categories = useLoader(fetchCategories, 'categories');
  const list = useLoader(() => fetchServices({
    q: filters.q, categoryId: filters.categoryId, providerId: filters.providerId, active: filters.active, mode: filters.mode,
    page: filters.page, size: PAGE_SIZE
  }), JSON.stringify(filters));
  const [editing, setEditing] = useState(null); // { service } - service undefined when creating
  const [assigning, setAssigning] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const page = list.data;
  const services = Array.isArray(page?.content) ? page.content : [];
  const categoryList = Array.isArray(categories.data) ? categories.data : [];
  const filtered = Boolean(filters.q || filters.categoryId || filters.providerId || filters.active || filters.mode);
  const replace = (updated) => list.setData((d) => (d ? { ...d, content: d.content.map((s) => (s.id === updated.id ? updated : s)) } : d));

  const toggleActive = async (s) => {
    setBusyId(s.id);
    try {
      const updated = await setServiceActive(s.id, !s.active);
      replace(updated);
      toast(t(updated.active ? 'admin.services.nowEnabled' : 'admin.services.nowDisabled', { name: s.name }), 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout
      title={t('admin.services.title')}
      subtitle={t('admin.services.subtitle')}
      actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({})}>{t('admin.services.add')}</button>}
    >
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <SearchBox label={t('admin.services.search')} placeholder={t('admin.services.searchPlaceholder')} value={filters.q}
          onCommit={(q) => setFilters({ q })} />
        <ProviderPicker className="admin-filter" label={t('admin.services.provider')} placeholder={t('admin.common.allProviders')}
          value={filters.providerId ? { id: Number(filters.providerId), name: filters.providerName } : null}
          onChange={(p) => setFilters({ providerId: p ? String(p.id) : '', providerName: p ? p.name : '' })} />
        <FilterSelect label={t('admin.services.category')} value={filters.categoryId} onChange={(categoryId) => setFilters({ categoryId })}
          options={[{ value: '', label: t('admin.services.allCategories') }, ...categoryList.map((c) => ({ value: String(c.id), label: c.name }))]} />
        <FilterSelect label={t('admin.services.mode')} value={filters.mode} onChange={(mode) => setFilters({ mode })}
          options={[{ value: '', label: t('admin.services.allModes') }, ...MODES.map((m) => ({ value: m, label: t(`admin.modes.${m}`) }))]} />
        <FilterSelect label={t('admin.services.status')} value={filters.active} onChange={(active) => setFilters({ active })}
          options={[
            { value: '', label: t('admin.users.allStatuses') },
            { value: 'true', label: t('admin.services.enabled') },
            { value: 'false', label: t('admin.services.disabled') }
          ]} />
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm admin-clear"
            onClick={() => setFilters({ q: '', categoryId: '', providerId: '', providerName: '', active: '', mode: '' })}>
            {t('admin.common.clearFilters')}
          </button>
        ) : null}
      </div>

      <DataState loading={list.loading} error={list.error} hasData={Boolean(page)} onRetry={list.reload}
        empty={Boolean(page) && services.length === 0} emptyTitle={t('admin.services.empty')} emptyText={t('admin.services.emptyText')}>
        <p className="admin-count" aria-live="polite">{plural('admin.services.count', page?.totalElements || 0)}</p>
        <TableWrap label={t('admin.services.tableLabel')} busy={list.loading}>
          <table className="table admin-table">
            <caption className="sr-only">{t('admin.services.tableLabel')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.services.colService')}</th>
                <th scope="col">{t('admin.services.colProvider')}</th>
                <th scope="col">{t('admin.services.colDuration')}</th>
                <th scope="col" className="adm-num">{t('admin.services.colPrice')}</th>
                <th scope="col">{t('admin.services.colStatus')}</th>
                <th scope="col">{t('admin.common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className={s.active ? undefined : 'adm-muted'}>
                  <th scope="row" className="adm-cell-main">
                    <span className="adm-cell-with-thumb">
                      {s.imageUrl ? <img src={s.imageUrl} alt="" className="adm-cell-thumb" loading="lazy" /> : <span className="adm-cell-thumb adm-cell-thumb-empty" aria-hidden="true" />}
                      <span>
                        <span className="adm-cell-title">{s.name}</span>
                        <span className="adm-cell-sub">{[s.categoryName, t(`admin.modes.${s.mode || 'IN_PERSON'}`)].filter(Boolean).join(' · ')}</span>
                        {s.description ? <span className="adm-cell-sub adm-clamp">{s.description}</span> : null}
                      </span>
                    </span>
                  </th>
                  <td>
                    <span className="adm-cell-title">{s.providerName}</span>
                    {s.providerCity ? <span className="adm-cell-sub">{s.providerCity}</span> : null}
                  </td>
                  <td className="adm-nowrap">
                    {t('admin.services.durationValue', { duration: fmt.number(s.durationMin) })}
                    {s.bufferMin ? <span className="adm-cell-sub">{t('admin.services.bufferValue', { buffer: fmt.number(s.bufferMin) })}</span> : null}
                  </td>
                  <td className="adm-num adm-nowrap">
                    {fmt.money(s.price)}
                    {s.depositPercent ? <span className="adm-cell-sub">{t('admin.services.depositValue', { percent: fmt.number(s.depositPercent) })}</span> : null}
                  </td>
                  <td>
                    {s.active
                      ? <span className="badge badge-success">{t('admin.services.enabled')}</span>
                      : <span className="badge badge-muted">{t('admin.services.disabled')}</span>}
                  </td>
                  <td>
                    <div className="adm-actions adm-actions-grid">
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => setEditing({ service: s })}
                        aria-label={`${t('admin.common.edit')}: ${s.name}`}>{t('admin.common.edit')}</button>
                      <button type="button" className="btn btn-outline btn-xs" disabled={busyId === s.id} onClick={() => toggleActive(s)}
                        aria-label={`${s.active ? t('admin.services.disable') : t('admin.services.enable')}: ${s.name}`}>
                        {busyId === s.id ? t('admin.common.working') : s.active ? t('admin.services.disable') : t('admin.services.enable')}
                      </button>
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => setAssigning(s)}
                        aria-label={t('admin.services.assignName', { name: s.name })}>{t('admin.services.assign')}</button>
                      <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => setDeleting(s)}
                        aria-label={`${t('admin.common.delete')}: ${s.name}`}>{t('admin.common.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <Pager page={page?.page ?? filters.page} totalPages={page?.totalPages} onPage={(p) => setFilters({ page: p })} />
      </DataState>

      {editing ? (
        <ServiceFormDialog service={editing.service} categories={categoryList} onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            if (created) list.reload();
            else replace(saved);
          }} />
      ) : null}

      {assigning ? (
        <AssignDialog service={assigning} onClose={() => setAssigning(null)} onAssigned={() => { setAssigning(null); list.reload(); }} />
      ) : null}

      {deleting ? (
        <DeleteServiceDialog service={deleting} onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); list.reload(); }}
          onDisabled={(updated) => { setDeleting(null); replace(updated); }} />
      ) : null}
    </AdminLayout>
  );
}

/** Create / edit form. Changing the provider of an existing service re-assigns it. */
export function ServiceFormDialog({ service, categories, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const formRef = useRef(null);
  const [form, setForm] = useState(() => serviceForm(service));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageStatus, setImageStatus] = useState('');
  const editing = Boolean(service);
  const moving = editing && form.provider?.id && form.provider.id !== service.providerId;

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    const errorKey = key === 'provider' ? 'providerId' : key;
    if (errors[errorKey]) setErrors((e) => ({ ...e, [errorKey]: undefined }));
  };

  const focusFirstError = () => setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.test(file.type)) {
      setErrors((x) => ({ ...x, imageUrl: t('admin.services.imageType') }));
      return;
    }
    if (file.size > IMAGE_MAX) {
      setErrors((x) => ({ ...x, imageUrl: t('admin.services.imageTooBig') }));
      return;
    }
    setUploading(true);
    setImageStatus(t('admin.services.uploading'));
    setErrors((x) => ({ ...x, imageUrl: undefined }));
    try {
      const res = await uploadImage(file);
      set('imageUrl', res.url);
      setImageStatus(t('admin.services.uploaded'));
    } catch (err) {
      setErrors((x) => ({ ...x, imageUrl: getErrorMessage(err) }));
      setImageStatus('');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const invalid = validateService(form);
    if (Object.keys(invalid).length) {
      setErrors(Object.fromEntries(Object.entries(invalid).map(([k, key]) => [k, t(key)])));
      setFormError(t('admin.services.fixErrors'));
      focusFirstError();
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const payload = servicePayload(form, service);
      const saved = editing ? await updateService(service.id, payload) : await createService(payload);
      toast(t(editing ? 'admin.services.updated' : 'admin.services.created', { name: saved?.name || payload.name }), 'success');
      onSaved(saved, !editing);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(getErrorMessage(err));
      setBusy(false);
      focusFirstError();
    }
  };

  const numberField = (key, label, { min, max, step = 1, hint } = {}) => (
    <Field label={label} hint={hint} error={errors[key]} required={key === 'durationMin'}>
      {(props) => (
        <input {...props} type="number" inputMode={step === 1 ? 'numeric' : 'decimal'} min={min} max={max} step={step}
          value={form[key]} onChange={(e) => set(key, e.target.value)} />
      )}
    </Field>
  );

  return (
    <Modal title={editing ? t('admin.services.editTitle', { name: service.name }) : t('admin.services.createTitle')}
      onClose={onClose} wide closeDisabled={busy} closeOnBackdrop={false}>
      <form ref={formRef} onSubmit={submit} noValidate>
        <ProviderPicker label={t('admin.services.fieldProvider')} hint={t('admin.services.fieldProviderHint')} required
          value={form.provider} onChange={(p) => set('provider', p)} error={errors.providerId} />
        {moving ? <p className="form-note" role="status">{t('admin.services.reassignHint', { name: form.provider.name })}</p> : null}

        <Field label={t('admin.services.fieldName')} error={errors.name} required>
          {(props) => <input {...props} type="text" maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label={t('admin.services.fieldDescription')} error={errors.description}>
          {(props) => <textarea {...props} rows={3} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>

        <div className="form-grid">
          <Field label={t('admin.services.fieldCategory')} error={errors.categoryId}>
            {(props) => (
              <select {...props} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">{t('admin.services.noCategory')}</option>
                {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('admin.services.fieldMode')} error={errors.mode}>
            {(props) => (
              <select {...props} value={form.mode} onChange={(e) => set('mode', e.target.value)}>
                {MODES.map((m) => <option key={m} value={m}>{t(`admin.modes.${m}`)}</option>)}
              </select>
            )}
          </Field>
          {numberField('durationMin', t('admin.services.fieldDuration'), { min: 5, max: 480 })}
          {numberField('bufferMin', t('admin.services.fieldBuffer'), { min: 0, max: 120, hint: t('admin.services.fieldBufferHint') })}
          {numberField('price', t('admin.services.fieldPrice'), { min: 0, step: 0.01 })}
          {numberField('depositPercent', t('admin.services.fieldDeposit'), { min: 0, max: 100, hint: t('admin.services.fieldDepositHint') })}
          {numberField('maxAdvanceBookingDays', t('admin.services.fieldAdvance'), { min: 0, max: 365, hint: t('admin.services.fieldAdvanceHint') })}
        </div>

        <Field label={t('admin.services.fieldImage')} hint={t('admin.services.fieldImageHint')} error={errors.imageUrl}>
          {(props) => (
            <input {...props} required={undefined} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} disabled={uploading} />
          )}
        </Field>
        <p className="sr-only" aria-live="polite">{imageStatus}</p>
        {uploading ? <p className="muted-line"><span className="spinner dark" aria-hidden="true" /> {t('admin.services.uploading')}</p> : null}
        {form.imageUrl ? (
          <div className="adm-image-preview">
            <img src={form.imageUrl} alt={t('admin.services.imagePreview')} />
            <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => { set('imageUrl', ''); setImageStatus(''); }}>
              {t('admin.services.removeImage')}
            </button>
          </div>
        ) : null}

        <label className="switch admin-switch">
          <input type="checkbox" role="switch" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <span className="switch-track"><span className="switch-thumb" /></span>
          {t('admin.services.fieldActive')}
        </label>

        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="adm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{t('admin.common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || uploading}>
            {busy ? t('admin.common.saving') : editing ? t('admin.common.save') : t('admin.services.createSubmit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "Assign to another provider": copies the service (POST /admin/services/{id}/assign). */
function AssignDialog({ service, onClose, onAssigned }) {
  const t = useT();
  const toast = useToast();
  const [target, setTarget] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!target) {
      setError(t('admin.services.errProvider'));
      return;
    }
    if (target.id === service.providerId) {
      setError(t('admin.services.assignSame'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await assignService(service.id, target.id);
      toast(t('admin.services.assigned', { name: service.name, provider: target.name }), 'success');
      onAssigned();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog title={t('admin.services.assignTitle', { name: service.name })} confirmLabel={t('admin.services.assignConfirm')}
      danger={false} onConfirm={confirm} onClose={onClose} busy={busy}>
      <p>{t('admin.services.assignText')}</p>
      <ProviderPicker label={t('admin.services.assignTarget')} required value={target}
        onChange={(p) => { setTarget(p); setError(''); }} error={error || undefined} />
    </ConfirmDialog>
  );
}

/** Delete; a 409 means the service has bookings, so offer to disable it instead. */
function DeleteServiceDialog({ service, onClose, onDeleted, onDisabled }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inUse, setInUse] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteService(service.id);
      toast(t('admin.services.deleted', { name: service.name }), 'success');
      onDeleted();
    } catch (err) {
      if (err?.response?.status === 409) {
        setInUse(true);
        setError(t('admin.services.inUse', { name: service.name }));
      } else {
        setError(getErrorMessage(err));
      }
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const updated = await setServiceActive(service.id, false);
      toast(t('admin.services.nowDisabled', { name: service.name }), 'success');
      onDisabled(updated);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const offerDisable = inUse && service.active;
  return (
    <ConfirmDialog title={t('admin.services.deleteTitle', { name: service.name })}
      confirmLabel={offerDisable ? t('admin.services.disableInstead') : t('admin.services.deleteConfirm')}
      busyLabel={offerDisable ? t('admin.common.working') : t('admin.common.deleting')}
      danger={!offerDisable} onConfirm={offerDisable ? disable : remove} onClose={onClose} busy={busy} error={error}
      confirmHidden={inUse && !service.active}>
      <p>{t('admin.services.deleteText')}</p>
    </ConfirmDialog>
  );
}
