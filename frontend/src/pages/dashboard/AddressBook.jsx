import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/client';
import Modal from '../../components/Modal';
import AccountNav from '../../components/AccountNav';
import { InlineLoader } from '../../components/Loader';
import { useToast } from '../../components/Toast';
import { useT } from '../../i18n';
import ConfirmDialog from './appointment/ConfirmDialog';

const LABELS = ['Home', 'Work', 'Other'];
const EMPTY = { label: 'Home', addressLine: '', city: '', state: '', country: '', zip: '', defaultAddress: false };

export default function AddressBook() {
  const t = useT();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.get('/addresses')
      .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
      .catch((e) => { setItems((prev) => prev || []); setError(getErrorMessage(e, t('site.addresses.loadFailed'))); });
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const open = () => { setShowForm(true); setForm(EMPTY); setFormError(''); };
  const close = () => { setShowForm(false); setForm(EMPTY); };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    const payload = { ...form, defaultAddress: Boolean(form.defaultAddress) };
    try {
      await api.post('/addresses', payload);
      toast(t('site.addresses.added'), 'success');
      close();
      load();
    } catch (err) {
      setFormError(getErrorMessage(err, t('site.addresses.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a) => {
    try {
      await api.delete(`/addresses/${a.id}`);
      setRemoving(null);
      toast(t('site.addresses.removed'), 'success');
      load();
    } catch (err) {
      throw new Error(getErrorMessage(err, t('site.common.failed')));
    }
  };

  return (
    <div className="dash">
      <AccountNav />

      <div className="dash-main">
        <div className="section-title">
          <div>
            <h1 className="dash-title">{t('site.addresses.title')}</h1>
            <p>{t('site.addresses.lead')}</p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={open}>{t('site.addresses.add')}</button>
        </div>

        {error && (
          <div className="form-error" role="alert">
            {error}{' '}
            <button type="button" className="btn btn-outline btn-xs" onClick={load}>{t('common.retry')}</button>
          </div>
        )}

        {!items ? (
          <p className="muted-line" role="status"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
        ) : items.length === 0 ? (
          !error && (
            <div className="empty card card-pad">
              <h2 className="empty-title">{t('site.addresses.empty')}</h2>
              <p className="mt-1">{t('site.addresses.emptyText')}</p>
            </div>
          )
        ) : (
          <ul className="address-grid plain-grid">
            {items.map((a) => (
              <li key={a.id} className="card card-pad">
                <div className="address-head">
                  <h2 className="address-label">{LABELS.includes(a.label) ? t(`site.addresses.labels.${a.label}`) : a.label}</h2>
                  {a.defaultAddress && <span className="badge badge-green">{t('site.addresses.default')}</span>}
                </div>
                <p className="address-text">
                  {a.addressLine}<br />
                  {[a.city, a.state, a.country, a.zip].filter(Boolean).join(', ')}
                </p>
                <button type="button" className="btn btn-danger-outline btn-sm mt-2" onClick={() => setRemoving(a)}
                  aria-label={t('site.addresses.deleteAria', { label: a.label, line: a.addressLine })}>
                  {t('site.addresses.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <Modal title={t('site.addresses.addTitle')} onClose={close} closeDisabled={busy}>
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="addr-label">{t('site.addresses.label')}</label>
              <select id="addr-label" value={form.label} onChange={set('label')}>
                {LABELS.map((l) => <option key={l} value={l}>{t(`site.addresses.labels.${l}`)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="addr-line">{t('site.addresses.line')}</label>
              <input id="addr-line" value={form.addressLine} onChange={set('addressLine')} required maxLength={255} autoComplete="street-address" />
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="addr-city">{t('site.filters.city')}</label><input id="addr-city" value={form.city} onChange={set('city')} maxLength={100} autoComplete="address-level2" /></div>
              <div className="field"><label htmlFor="addr-state">{t('site.addresses.state')}</label><input id="addr-state" value={form.state} onChange={set('state')} maxLength={100} autoComplete="address-level1" /></div>
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="addr-country">{t('site.addresses.country')}</label><input id="addr-country" value={form.country} onChange={set('country')} maxLength={60} autoComplete="country-name" /></div>
              <div className="field"><label htmlFor="addr-zip">{t('site.addresses.zip')}</label><input id="addr-zip" value={form.zip} onChange={set('zip')} maxLength={20} autoComplete="postal-code" /></div>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={form.defaultAddress} onChange={(e) => setForm({ ...form, defaultAddress: e.target.checked })} />
              {t('site.addresses.makeDefault')}
            </label>
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? <InlineLoader label={t('site.common.saving')} /> : t('site.addresses.add')}
            </button>
          </form>
        </Modal>
      )}

      {removing && (
        <ConfirmDialog title={t('site.addresses.deleteTitle')} text={t('site.addresses.deleteText', { line: removing.addressLine })} danger
          confirmLabel={t('site.addresses.delete')} onConfirm={() => remove(removing)} onClose={() => setRemoving(null)} />
      )}
    </div>
  );
}
