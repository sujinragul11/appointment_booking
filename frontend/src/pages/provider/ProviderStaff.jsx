import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { initials } from '../../utils/format';
import { ProviderShell, PageHead, ErrorState, EmptyState, SectionLoading } from './components/Shell';
import Field, { ErrorSummary } from './components/Field';
import ImageUpload from './components/ImageUpload';
import useLoad, { fieldErrorsOf } from './lib/useLoad';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function staffToPayload(form) {
  return {
    name: form.name.trim(),
    designation: form.designation.trim() || null,
    bio: form.bio.trim() || null,
    photoUrl: form.photoUrl || (form.hadPhoto ? '' : null),
    active: Boolean(form.active),
    serviceIds: form.serviceIds.map(Number),
    email: form.email.trim() ? form.email.trim().toLowerCase() : null
  };
}

function StaffForm({ member, services, onSaved, onClose }) {
  const { t } = useI18n();
  const uid = useId();
  const id = (f) => `${uid}-${f}`;
  const [form, setForm] = useState(() => ({
    name: member?.name || '',
    designation: member?.designation || '',
    bio: member?.bio || '',
    photoUrl: member?.photoUrl || '',
    hadPhoto: Boolean(member?.photoUrl),
    active: member ? member.active : true,
    serviceIds: [...(member?.serviceIds || [])],
    email: ''
  }));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const labels = {
    name: t('provider.team.fields.name'), designation: t('provider.team.fields.designation'), bio: t('provider.team.fields.bio'),
    email: t('provider.team.fields.email'), serviceIds: t('provider.team.fields.services'), photoUrl: t('provider.team.fields.photo')
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (!form.name.trim()) found.name = t('provider.team.errors.name');
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) found.email = t('provider.team.errors.email');
    setMessage('');
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage(t('provider.common.fixErrors'));
      document.getElementById(id(found.name ? 'name' : 'email'))?.focus();
      return;
    }
    setBusy(true);
    try {
      const payload = staffToPayload(form);
      const saved = member ? await providerApi.updateStaff(member.id, payload) : await providerApi.createStaff(payload);
      onSaved(saved, !member, Boolean(payload.email) && !member?.loginEmail);
    } catch (err) {
      const fe = fieldErrorsOf(err);
      const msg = getErrorMessage(err, t('provider.common.saveFailed'));
      // 409 "An account with this e-mail already exists" has no field map: pin it to the e-mail field
      if (!Object.keys(fe).length && err?.response?.status === 409 && form.email.trim()) fe.email = msg;
      setErrors(fe);
      setMessage(msg);
      const first = ['name', 'designation', 'email'].find((f) => fe[f]);
      if (first) document.getElementById(id(first))?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={member ? t('provider.team.editTitle', { name: member.name }) : t('provider.team.addTitle')} onClose={onClose}
      wide closeDisabled={busy} closeOnBackdrop={false}>
      <form onSubmit={submit} noValidate className="pp-form">
        <div className="form-grid">
          <Field id={id('name')} label={labels.name} required error={errors.name}>
            {(p) => <input {...p} value={form.name} maxLength={120} autoComplete="off" onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field id={id('designation')} label={labels.designation} optional error={errors.designation}>
            {(p) => <input {...p} value={form.designation} maxLength={120} placeholder={t('provider.team.designationPlaceholder')}
              onChange={(e) => set('designation', e.target.value)} />}
          </Field>
        </div>
        <Field id={id('bio')} label={labels.bio} optional error={errors.bio}>
          {(p) => <textarea {...p} rows={3} maxLength={5000} value={form.bio} onChange={(e) => set('bio', e.target.value)} />}
        </Field>
        <ImageUpload label={labels.photoUrl} value={form.photoUrl} onChange={(url) => set('photoUrl', url)} shape="round" />

        <fieldset className="pp-fieldset">
          <legend className="field-label">{labels.serviceIds}</legend>
          <p className="hint" id={id('svc-hint')}>{t('provider.team.servicesHint')}</p>
          {services.length === 0 ? <p className="pp-muted">{t('provider.team.noServices')}</p> : (
            <div className="pp-checks">
              {services.map((s) => (
                <label key={s.id} className="pp-check-inline">
                  <input type="checkbox" checked={form.serviceIds.includes(s.id)} aria-describedby={id('svc-hint')}
                    onChange={(e) => set('serviceIds', e.target.checked ? [...form.serviceIds, s.id] : form.serviceIds.filter((x) => x !== s.id))} />
                  <span>{s.name}{s.active ? '' : <span className="pp-muted"> ({t('provider.services.off')})</span>}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="pp-fieldset">
          <legend className="field-label">{t('provider.team.loginTitle')}</legend>
          {member?.loginEmail ? (
            <p className="pp-login-note"><span aria-hidden="true">✓ </span>{t('provider.team.hasLogin', { email: member.loginEmail })}</p>
          ) : (
            <Field id={id('email')} label={labels.email} optional error={errors.email} hint={t('provider.team.emailHint')}>
              {(p) => <input {...p} type="email" autoComplete="off" value={form.email} maxLength={150} onChange={(e) => set('email', e.target.value)} />}
            </Field>
          )}
        </fieldset>

        <label className="pp-check-inline pp-active-check">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <span>{t('provider.team.fields.active')}</span>
        </label>

        <ErrorSummary message={message} errors={message ? errors : {}} labels={labels} />
        <div className="pp-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('provider.common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('provider.common.saving') : member ? t('provider.common.saveChanges') : t('provider.team.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProviderStaff() {
  const { t } = useI18n();
  const toast = useToast();
  const staffQ = useLoad(() => providerApi.staff(), []);
  const servicesQ = useLoad(() => providerApi.services(), []);
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const staff = staffQ.data || [];
  const services = servicesQ.data || [];
  const serviceName = Object.fromEntries(services.map((s) => [s.id, s.name]));

  const replace = (saved) => staffQ.setData((list = []) => {
    const exists = list.some((x) => x.id === saved.id);
    return (exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]).sort((a, b) => a.name.localeCompare(b.name));
  });

  const onSaved = (saved, created, invited) => {
    replace(saved);
    setEditing(null);
    servicesQ.reload();
    let msg = created ? t('provider.team.created', { name: saved.name }) : t('provider.team.updated', { name: saved.name });
    if (invited && saved.loginEmail) msg += ` ${t('provider.team.invited', { email: saved.loginEmail })}`;
    toast(msg, 'success');
  };

  const deactivate = async (m) => {
    setBusyId(m.id);
    try {
      await providerApi.deactivateStaff(m.id);
      replace({ ...m, active: false });
      setConfirming(null);
      servicesQ.reload();
      toast(t('provider.team.deactivated', { name: m.name }), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('provider.common.saveFailed')), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const reactivate = async (m) => {
    setBusyId(m.id);
    try {
      const saved = await providerApi.updateStaff(m.id, {
        name: m.name, designation: m.designation ?? null, bio: m.bio ?? null, active: true, serviceIds: m.serviceIds || []
      });
      replace(saved);
      servicesQ.reload();
      toast(t('provider.team.reactivated', { name: m.name }), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('provider.common.saveFailed')), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ProviderShell>
      <PageHead title={t('provider.team.title')} lead={t('provider.team.lead')}
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <span aria-hidden="true">+ </span>{t('provider.team.add')}</button>} />

      {staffQ.error ? <ErrorState error={staffQ.error} onRetry={staffQ.reload} /> : !staffQ.data ? <SectionLoading /> : staff.length === 0 ? (
        <EmptyState title={t('provider.team.empty')} text={t('provider.team.emptyText')}
          action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>{t('provider.team.add')}</button>} />
      ) : (
        <ul className="pp-team">
          {staff.map((m) => (
            <li key={m.id} className={`card pp-member ${m.active ? '' : 'is-off'}`}>
              <div className="pp-member-head">
                <span className="avatar pp-member-avatar">
                  {m.photoUrl ? <img src={m.photoUrl} alt="" /> : <span aria-hidden="true">{initials(m.name)}</span>}
                </span>
                <div className="pp-member-id">
                  <h2 className="pp-member-name">{m.name}</h2>
                  <p className="pp-muted">{m.designation || t('provider.team.member')}</p>
                </div>
                <span className={`badge ${m.active ? 'badge-green' : 'badge-gray'}`}>{m.active ? t('provider.team.active') : t('provider.team.inactive')}</span>
              </div>
              {m.bio && <p className="pp-member-bio">{m.bio}</p>}
              <div className="pp-member-block">
                <span className="pp-member-label">{t('provider.team.fields.services')}</span>
                {(m.serviceIds || []).length ? (
                  <ul className="pp-chips">{m.serviceIds.map((sid) => <li key={sid} className="pp-chip">{serviceName[sid] || `#${sid}`}</li>)}</ul>
                ) : <span className="pp-muted">{t('provider.team.noAssigned')}</span>}
              </div>
              <p className="pp-member-login">
                {m.loginEmail ? <><span aria-hidden="true">✉ </span>{t('provider.team.loginAs', { email: m.loginEmail })}</> : <span className="pp-muted">{t('provider.team.noLogin')}</span>}
              </p>
              <div className="pp-member-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(m)}>
                  {t('provider.common.edit')}<span className="sr-only"> {m.name}</span>
                </button>
                {m.active ? (
                  <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setConfirming(m)} disabled={busyId === m.id}>
                    {t('provider.team.deactivate')}<span className="sr-only"> {m.name}</span>
                  </button>
                ) : (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => reactivate(m)} disabled={busyId === m.id}>
                    {busyId === m.id ? t('provider.common.working') : t('provider.team.reactivate')}<span className="sr-only"> {m.name}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <StaffForm member={editing === 'new' ? null : editing} services={services} onSaved={onSaved} onClose={() => setEditing(null)} />
      )}
      {confirming && (
        <Modal title={t('provider.team.deactivateTitle', { name: confirming.name })} onClose={() => setConfirming(null)} closeDisabled={busyId === confirming.id}>
          <p className="pp-dialog-text">{t('provider.team.deactivateText')}</p>
          <div className="pp-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)} disabled={busyId === confirming.id}>{t('provider.common.back')}</button>
            <button type="button" className="btn btn-danger" onClick={() => deactivate(confirming)} disabled={busyId === confirming.id}>
              {busyId === confirming.id ? t('provider.common.working') : t('provider.team.deactivate')}
            </button>
          </div>
        </Modal>
      )}
    </ProviderShell>
  );
}
