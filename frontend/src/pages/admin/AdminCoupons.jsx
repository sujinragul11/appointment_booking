import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { createCoupon, deleteCoupon, fetchCoupons, updateCoupon } from '../../api/admin';
import { todayISO } from '../../utils/format';
import AdminLayout from './AdminLayout';
import { ConfirmDialog, DataState, Field, TableWrap, fieldErrors } from './adminUi';
import { useAdminFormat, useLoader, usePlural } from './adminHooks';

const CODE = /^[A-Za-z0-9_-]{3,40}$/;
const EMPTY = {
  code: '', discountType: 'PERCENT', value: '10', minOrder: '0', maxDiscount: '0', validFrom: '', validTo: '',
  usageLimit: '0', perUserLimit: '0', active: true
};

export function couponForm(c) {
  if (!c) return { ...EMPTY };
  return {
    code: c.code || '',
    discountType: c.discountType || 'PERCENT',
    value: String(c.value ?? ''),
    minOrder: String(c.minOrder ?? 0),
    maxDiscount: String(c.maxDiscount ?? 0),
    validFrom: c.validFrom || '',
    validTo: c.validTo || '',
    usageLimit: String(c.usageLimit ?? 0),
    perUserLimit: String(c.perUserLimit ?? 0),
    active: c.active !== false
  };
}

const isWhole = (v) => /^\d+$/.test(String(v).trim());
const isAmount = (v) => String(v).trim() !== '' && Number(v) >= 0;

/** Mirrors CouponRequest's rules (plus percent <= 100 and validTo >= validFrom). Returns { field: i18nKey }. */
export function validateCoupon(form) {
  const errors = {};
  if (!CODE.test(form.code.trim())) errors.code = 'admin.coupons.errCode';
  const value = Number(form.value);
  if (String(form.value).trim() === '' || !(value > 0)) errors.value = 'admin.coupons.errValue';
  else if (form.discountType === 'PERCENT' && value > 100) errors.value = 'admin.coupons.errPercent';
  if (!isAmount(form.minOrder)) errors.minOrder = 'admin.coupons.errAmount';
  if (!isAmount(form.maxDiscount)) errors.maxDiscount = 'admin.coupons.errAmount';
  if (form.validFrom && form.validTo && form.validTo < form.validFrom) errors.validTo = 'admin.coupons.errDates';
  if (!isWhole(form.usageLimit)) errors.usageLimit = 'admin.coupons.errWhole';
  if (!isWhole(form.perUserLimit)) errors.perUserLimit = 'admin.coupons.errWhole';
  return errors;
}

export function couponPayload(form) {
  return {
    code: form.code.trim().toUpperCase(),
    discountType: form.discountType,
    value: Number(form.value),
    minOrder: Number(form.minOrder) || 0,
    maxDiscount: Number(form.maxDiscount) || 0,
    validFrom: form.validFrom || null,
    validTo: form.validTo || null,
    usageLimit: Number(form.usageLimit) || 0,
    perUserLimit: Number(form.perUserLimit) || 0,
    active: Boolean(form.active)
  };
}

/** 'active' | 'paused' | 'expired' | 'scheduled' | 'usedUp' */
export function couponState(c, today = todayISO()) {
  if (!c.active) return 'paused';
  if (c.validTo && c.validTo < today) return 'expired';
  if (c.validFrom && c.validFrom > today) return 'scheduled';
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return 'usedUp';
  return 'active';
}
const STATE_BADGE = { active: 'badge-success', paused: 'badge-muted', expired: 'badge-danger', scheduled: 'badge-blue', usedUp: 'badge-amber' };

/** Coupons: discount codes with value / validity / usage limits. */
export default function AdminCoupons() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const list = useLoader(fetchCoupons, 'coupons');
  const [editing, setEditing] = useState(null); // { coupon } - undefined coupon when creating
  const [deleting, setDeleting] = useState(null);
  const coupons = Array.isArray(list.data) ? list.data : [];

  const discount = (c) => {
    const main = c.discountType === 'PERCENT'
      ? t('admin.coupons.percentOff', { value: fmt.decimal(c.value) })
      : t('admin.coupons.flatOff', { value: fmt.money(c.value) });
    const extras = [
      c.maxDiscount > 0 && c.discountType === 'PERCENT' ? t('admin.coupons.maxCap', { amount: fmt.money(c.maxDiscount) }) : null,
      c.minOrder > 0 ? t('admin.coupons.minOrder', { amount: fmt.money(c.minOrder) }) : null
    ].filter(Boolean);
    return { main, extras };
  };

  const validity = (c) => {
    if (c.validFrom && c.validTo) return `${fmt.date(c.validFrom)} – ${fmt.date(c.validTo)}`;
    if (c.validFrom) return t('admin.coupons.fromDate', { date: fmt.date(c.validFrom) });
    if (c.validTo) return t('admin.coupons.untilDate', { date: fmt.date(c.validTo) });
    return t('admin.coupons.always');
  };

  return (
    <AdminLayout
      title={t('admin.coupons.title')}
      subtitle={t('admin.coupons.subtitle')}
      actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({})}>{t('admin.coupons.add')}</button>}
    >
      <DataState loading={list.loading} error={list.error} hasData={Array.isArray(list.data)} onRetry={list.reload}
        empty={Array.isArray(list.data) && coupons.length === 0} emptyTitle={t('admin.coupons.empty')} emptyText={t('admin.coupons.emptyText')}>
        <p className="admin-count" aria-live="polite">{plural('admin.coupons.count', coupons.length)}</p>
        <TableWrap label={t('admin.coupons.tableLabel')} busy={list.loading}>
          <table className="table admin-table">
            <caption className="sr-only">{t('admin.coupons.tableLabel')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.coupons.colCode')}</th>
                <th scope="col">{t('admin.coupons.colDiscount')}</th>
                <th scope="col">{t('admin.coupons.colValidity')}</th>
                <th scope="col">{t('admin.coupons.colUsage')}</th>
                <th scope="col">{t('admin.coupons.colPerUser')}</th>
                <th scope="col">{t('admin.coupons.colStatus')}</th>
                <th scope="col">{t('admin.common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const d = discount(c);
                const state = couponState(c);
                return (
                  <tr key={c.id}>
                    <th scope="row"><code className="adm-coupon-code">{c.code}</code></th>
                    <td>
                      <span className="adm-cell-title">{d.main}</span>
                      {d.extras.map((x) => <span key={x} className="adm-cell-sub">{x}</span>)}
                    </td>
                    <td className="adm-nowrap">{validity(c)}</td>
                    <td className="adm-nowrap">
                      {c.usageLimit > 0
                        ? t('admin.coupons.usage', { used: fmt.number(c.usedCount), limit: fmt.number(c.usageLimit) })
                        : t('admin.coupons.usageUnlimited', { used: fmt.number(c.usedCount) })}
                    </td>
                    <td>{c.perUserLimit > 0 ? fmt.number(c.perUserLimit) : t('admin.coupons.noLimit')}</td>
                    <td><span className={`badge ${STATE_BADGE[state]}`}>{t(`admin.coupons.state.${state}`)}</span></td>
                    <td>
                      <div className="adm-actions">
                        <button type="button" className="btn btn-outline btn-xs" onClick={() => setEditing({ coupon: c })}
                          aria-label={`${t('admin.common.edit')}: ${c.code}`}>{t('admin.common.edit')}</button>
                        <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => setDeleting(c)}
                          aria-label={`${t('admin.common.delete')}: ${c.code}`}>{t('admin.common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </DataState>

      {editing ? (
        <CouponDialog coupon={editing.coupon} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />
      ) : null}
      {deleting ? (
        <DeleteCouponDialog coupon={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); list.reload(); }} />
      ) : null}
    </AdminLayout>
  );
}

function CouponDialog({ coupon, onClose, onSaved }) {
  const t = useT();
  const fmt = useAdminFormat();
  const toast = useToast();
  const formRef = useRef(null);
  const [form, setForm] = useState(() => couponForm(coupon));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(coupon);
  const percent = form.discountType === 'PERCENT';

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const focusFirstError = () => setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);

  const submit = async (e) => {
    e.preventDefault();
    const invalid = validateCoupon(form);
    if (Object.keys(invalid).length) {
      setErrors(Object.fromEntries(Object.entries(invalid).map(([k, key]) => [k, t(key)])));
      focusFirstError();
      return;
    }
    const payload = couponPayload(form);
    setBusy(true);
    setFormError('');
    try {
      if (editing) await updateCoupon(coupon.id, payload);
      else await createCoupon(payload);
      toast(t(editing ? 'admin.coupons.updated' : 'admin.coupons.created', { code: payload.code }), 'success');
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(getErrorMessage(err));
      setBusy(false);
      focusFirstError();
    }
  };

  const input = (key, props, extra = {}) => (
    <input {...props} value={form[key]} onChange={(e) => set(key, e.target.value)} {...extra} />
  );

  return (
    <Modal title={editing ? t('admin.coupons.editTitle', { code: coupon.code }) : t('admin.coupons.createTitle')}
      onClose={onClose} wide closeDisabled={busy} closeOnBackdrop={false}>
      <form ref={formRef} onSubmit={submit} noValidate>
        <Field label={t('admin.coupons.fieldCode')} hint={t('admin.coupons.fieldCodeHint')} error={errors.code} required>
          {(props) => input('code', props, {
            type: 'text', maxLength: 40, autoCapitalize: 'characters', spellCheck: false, className: 'adm-coupon-input',
            onChange: (e) => set('code', e.target.value.toUpperCase())
          })}
        </Field>
        <div className="form-grid">
          <Field label={t('admin.coupons.fieldType')} error={errors.discountType}>
            {(props) => (
              <select {...props} value={form.discountType} onChange={(e) => set('discountType', e.target.value)}>
                <option value="PERCENT">{t('admin.coupons.typePercent')}</option>
                <option value="FLAT">{t('admin.coupons.typeFlat')}</option>
              </select>
            )}
          </Field>
          <Field label={percent ? t('admin.coupons.fieldValuePercent') : t('admin.coupons.fieldValueFlat')}
            hint={percent ? t('admin.coupons.fieldValuePercentHint') : null} error={errors.value} required>
            {(props) => input('value', props, { type: 'number', min: 0, max: percent ? 100 : undefined, step: '0.01', inputMode: 'decimal' })}
          </Field>
          <Field label={t('admin.coupons.fieldMinOrder')} error={errors.minOrder}>
            {(props) => input('minOrder', props, { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}
          </Field>
          <Field label={t('admin.coupons.fieldMaxDiscount')} hint={t('admin.coupons.fieldMaxDiscountHint')} error={errors.maxDiscount}>
            {(props) => input('maxDiscount', props, { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}
          </Field>
          <Field label={t('admin.coupons.fieldValidFrom')} hint={t('admin.coupons.fieldValidityHint')} error={errors.validFrom}>
            {(props) => input('validFrom', props, { type: 'date', max: form.validTo || undefined })}
          </Field>
          <Field label={t('admin.coupons.fieldValidTo')} hint={t('admin.coupons.fieldValidityHint')} error={errors.validTo}>
            {(props) => input('validTo', props, { type: 'date', min: form.validFrom || undefined })}
          </Field>
          <Field label={t('admin.coupons.fieldUsageLimit')}
            hint={editing ? t('admin.coupons.fieldUsageLimitHintUsed', { used: fmt.number(coupon.usedCount) }) : t('admin.coupons.fieldUnlimitedHint')}
            error={errors.usageLimit}>
            {(props) => input('usageLimit', props, { type: 'number', min: 0, step: 1, inputMode: 'numeric' })}
          </Field>
          <Field label={t('admin.coupons.fieldPerUser')} hint={t('admin.coupons.fieldUnlimitedHint')} error={errors.perUserLimit}>
            {(props) => input('perUserLimit', props, { type: 'number', min: 0, step: 1, inputMode: 'numeric' })}
          </Field>
        </div>
        <label className="switch admin-switch">
          <input type="checkbox" role="switch" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <span className="switch-track"><span className="switch-thumb" /></span>
          {t('admin.coupons.fieldActive')}
        </label>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="adm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{t('admin.common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('admin.common.saving') : editing ? t('admin.common.save') : t('admin.coupons.createSubmit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteCouponDialog({ coupon, onClose, onDeleted }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteCoupon(coupon.id);
      toast(t('admin.coupons.deleted', { code: coupon.code }), 'success');
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog title={t('admin.coupons.deleteTitle', { code: coupon.code })} confirmLabel={t('admin.coupons.deleteConfirm')}
      busyLabel={t('admin.common.deleting')} onConfirm={remove} onClose={onClose} busy={busy} error={error}>
      <p>{t('admin.coupons.deleteText')}</p>
    </ConfirmDialog>
  );
}
