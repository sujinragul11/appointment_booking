import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage, setTokens } from '../../api/client';
import { uploadImage } from '../../api/site';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Loader, { InlineLoader } from '../../components/Loader';
import AccountNav from '../../components/AccountNav';
import PasswordStrength from '../../components/PasswordStrength';
import VerifyCode from '../../components/VerifyCode';
import { useI18n } from '../../i18n';
import { initials } from '../../utils/format';
import { formatStamp } from '../../utils/bookingCalendar';
import { checkPassword } from '../../utils/password';
import { disablePush, enablePush, isPushEnabled, pushPermission, showBrowserNotification } from '../../utils/push';

const PHONE_RE = /^\+?[0-9]{10,15}$/;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const FALLBACK_ZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Pacific/Auckland', 'UTC'
];

/** IANA time zones for the picker: the browser's full list when it has one. */
export function timeZoneOptions() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const zones = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(zones) && zones.length) return zones.includes('UTC') ? zones : [...zones, 'UTC'];
    }
  } catch {
    // older browsers: fall back to a short list
  }
  return FALLBACK_ZONES;
}

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

function Switch({ id, checked, onChange, disabled, label, hint }) {
  return (
    <div className="switch-row">
      <label className="switch" htmlFor={id}>
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined} />
        <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
        <span>{label}</span>
      </label>
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const { t, locale, lang, setLang, languages } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const zones = useMemo(timeZoneOptions, []);
  const fileRef = useRef(null);

  const [form, setForm] = useState({ name: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState({ language: 'en', timezone: '' });
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [notifBusy, setNotifBusy] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [verifying, setVerifying] = useState(null);
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passBusy, setPassBusy] = useState(false);
  const [passTried, setPassTried] = useState(false);
  const [passError, setPassError] = useState('');
  const [pushOn, setPushOn] = useState(isPushEnabled);
  const [permission, setPermission] = useState(pushPermission);

  useEffect(() => {
    if (!user) return;
    setForm({ name: user.name || '', phone: user.phone || '' });
    setPrefs({ language: user.language || lang, timezone: user.timezone || '' });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Loader label={t('common.loading')} />;

  const newPw = checkPassword(pass.newPassword);
  const emailVerified = Boolean(user.emailVerified || user.verified);
  const phoneValue = form.phone.replace(/[\s()-]/g, '');

  const saveProfile = async (e) => {
    e.preventDefault();
    setFormError('');
    if (phoneValue && !PHONE_RE.test(phoneValue)) {
      setFormError(t('auth.phoneInvalid'));
      return;
    }
    if (!phoneValue && user.phone) {
      // The API has no way to remove a number (an empty value fails validation).
      setFormError(t('site.profile.phoneRemove'));
      return;
    }
    setBusy(true);
    try {
      const payload = { name: form.name.trim() };
      if (phoneValue) payload.phone = phoneValue;
      const { data } = await api.put('/auth/profile', payload);
      const phoneChanged = (data.phone || '') !== (user.phone || '');
      updateUser(data);
      toast(phoneChanged ? t('site.profile.savedPhone') : t('site.profile.saved'), 'success');
    } catch (err) {
      setFormError(getErrorMessage(err, t('site.common.failed')));
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async (e) => {
    e.preventDefault();
    setPrefsBusy(true);
    try {
      const { data } = await api.put('/auth/profile', { language: prefs.language, timezone: prefs.timezone || '' });
      updateUser(data);
      setLang(prefs.language);
      toast(t('site.profile.prefsSaved'), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('site.common.failed')), 'error');
    } finally {
      setPrefsBusy(false);
    }
  };

  const setNotif = async (key, value) => {
    setNotifBusy(key);
    try {
      const { data } = await api.put('/auth/profile', { [key]: value });
      updateUser(data);
      toast(value ? t('site.profile.notifOn', { what: t(`site.profile.notif.${key}`) }) : t('site.profile.notifOff', { what: t(`site.profile.notif.${key}`) }), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('site.common.failed')), 'error');
    } finally {
      setNotifBusy('');
    }
  };

  const choosePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPhotoError('');
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError(t('site.profile.photoType'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(t('site.profile.photoSize'));
      return;
    }
    setPhotoBusy(true);
    try {
      const url = await uploadImage(file);
      const { data } = await api.put('/auth/profile', { photoUrl: url });
      updateUser(data);
      toast(t('site.profile.photoSaved'), 'success');
    } catch (err) {
      setPhotoError(getErrorMessage(err, t('site.profile.photoFailed')));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const { data } = await api.put('/auth/profile', { photoUrl: '' });
      updateUser(data);
      toast(t('site.profile.photoRemoved'), 'success');
    } catch (err) {
      setPhotoError(getErrorMessage(err, t('site.common.failed')));
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPassTried(true);
    setPassError('');
    if (!pass.currentPassword) {
      setPassError(t('site.profile.currentRequired'));
      return;
    }
    if (!newPw.valid) {
      setPassError(t('auth.weakPassword'));
      return;
    }
    if (pass.newPassword !== pass.confirm) {
      setPassError(t('site.reset.mismatch'));
      return;
    }
    setPassBusy(true);
    try {
      // Other sessions are signed out; this one continues with the new tokens.
      const { data } = await api.put('/auth/password', { currentPassword: pass.currentPassword, newPassword: pass.newPassword });
      if (data?.accessToken) setTokens(data.accessToken, data.refreshToken);
      if (data?.user) updateUser(data.user);
      setPass({ currentPassword: '', newPassword: '', confirm: '' });
      setPassTried(false);
      toast(t('site.profile.passwordChanged'), 'success');
    } catch (err) {
      setPassError(getErrorMessage(err, t('site.common.failed')));
    } finally {
      setPassBusy(false);
    }
  };

  const togglePush = async (on) => {
    if (!on) {
      disablePush();
      setPushOn(false);
      toast(t('site.profile.pushOff'), 'info');
      return;
    }
    const result = await enablePush();
    setPermission(result);
    if (result === 'granted') {
      setPushOn(true);
      toast(t('site.profile.pushOn'), 'success');
      showBrowserNotification(t('site.profile.pushTestTitle'), { body: t('site.profile.pushTestBody') }).catch(() => {});
    } else if (result === 'denied') {
      toast(t('site.profile.pushBlocked'), 'error');
    }
  };

  const doLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const zoneValue = prefs.timezone && !zones.includes(prefs.timezone) ? [prefs.timezone, ...zones] : zones;

  return (
    <div className="dash">
      <AccountNav />

      <div className="dash-main">
        <h1 className="dash-title">{t('site.profile.title')}</h1>
        <p className="page-lead mb-3">{t('site.profile.lead')}</p>

        <div className="profile-header card card-pad">
          <div className="avatar profile-avatar">
            {user.photoUrl ? <img src={user.photoUrl} alt={t('site.profile.photoAlt', { name: user.name })} /> : <span aria-hidden="true">{initials(user.name)}</span>}
          </div>
          <div className="profile-id">
            <div className="profile-name">{user.name}</div>
            <div className="break-all">{user.email}</div>
            <div className="hint">{t(`site.roles.${user.role}`)}
              {user.createdAt ? ` · ${t('site.profile.joined', { date: formatStamp(user.createdAt, locale) })}` : ''}</div>
          </div>
          <div className="profile-photo-actions">
            <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} hidden onChange={choosePhoto} />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()} disabled={photoBusy}
              aria-describedby="photo-hint">
              {photoBusy ? <InlineLoader label={t('site.profile.uploading')} /> : user.photoUrl ? t('site.profile.changePhoto') : t('site.profile.uploadPhoto')}
            </button>
            {user.photoUrl && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={removePhoto} disabled={photoBusy}>{t('site.profile.removePhoto')}</button>
            )}
            <p className="hint" id="photo-hint">{t('site.profile.photoHint')}</p>
            {photoError && <p className="error-text" role="alert">{photoError}</p>}
          </div>
        </div>

        <div className="profile-grid mt-3">
          <form className="card card-pad" onSubmit={saveProfile} aria-labelledby="profile-details" noValidate>
            <h2 id="profile-details" className="card-title">{t('site.profile.details')}</h2>
            <div className="field">
              <label htmlFor="profile-name">{t('auth.fullName')}</label>
              <input id="profile-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                minLength={2} maxLength={100} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="profile-email">{t('auth.email')}</label>
              <input id="profile-email" type="email" value={user.email} readOnly aria-describedby="profile-email-hint" className="readonly" />
              <span className="hint" id="profile-email-hint">{t('site.profile.emailFixed')}</span>
            </div>
            <div className="field">
              <label htmlFor="profile-phone">{t('auth.phone')}</label>
              <input id="profile-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t('auth.phonePlaceholder')} autoComplete="tel" aria-describedby="profile-phone-hint" />
              <span className="hint" id="profile-phone-hint">{t('site.profile.phoneHint')}</span>
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? <InlineLoader label={t('site.common.saving')} /> : t('site.profile.save')}
            </button>
          </form>

          <section className="card card-pad" aria-labelledby="profile-verify">
            <h2 id="profile-verify" className="card-title">{t('site.profile.verification')}</h2>
            <div className="verify-row">
              <div>
                <div className="verify-label">{t('auth.email')}</div>
                <div className="hint break-all">{user.email}</div>
              </div>
              {emailVerified
                ? <span className="badge badge-green"><span aria-hidden="true">✓ </span>{t('site.profile.verified')}</span>
                : <span className="badge badge-amber">{t('site.profile.notVerified')}</span>}
              {!emailVerified && verifying !== 'EMAIL' && (
                <button type="button" className="btn btn-outline btn-xs" onClick={() => setVerifying('EMAIL')}>{t('site.profile.verify')}</button>
              )}
            </div>
            {verifying === 'EMAIL' && (
              <VerifyCode channel="EMAIL" destination={user.email} autoSend headingLevel={3}
                onVerified={(u) => { updateUser(u); setVerifying(null); toast(t('site.verify.done'), 'success'); }}
                onCancel={() => setVerifying(null)} />
            )}
            <div className="verify-row mt-2">
              <div>
                <div className="verify-label">{t('auth.phone')}</div>
                <div className="hint">{user.phone || t('site.profile.noPhone')}</div>
              </div>
              {user.phone && (user.phoneVerified
                ? <span className="badge badge-green"><span aria-hidden="true">✓ </span>{t('site.profile.verified')}</span>
                : <span className="badge badge-amber">{t('site.profile.notVerified')}</span>)}
              {user.phone && !user.phoneVerified && verifying !== 'PHONE' && (
                <button type="button" className="btn btn-outline btn-xs" onClick={() => setVerifying('PHONE')}>{t('site.profile.verify')}</button>
              )}
            </div>
            {verifying === 'PHONE' && (
              <VerifyCode channel="PHONE" destination={user.phone} autoSend headingLevel={3}
                onVerified={(u) => { updateUser(u); setVerifying(null); toast(t('site.verify.phoneDone'), 'success'); }}
                onCancel={() => setVerifying(null)} />
            )}
          </section>

          <form className="card card-pad" onSubmit={savePrefs} aria-labelledby="profile-prefs">
            <h2 id="profile-prefs" className="card-title">{t('site.profile.preferences')}</h2>
            <div className="field">
              <label htmlFor="profile-language">{t('common.language')}</label>
              <select id="profile-language" value={prefs.language} onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}>
                {languages.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
              </select>
              <span className="hint">{t('site.profile.languageHint')}</span>
            </div>
            <div className="field">
              <label htmlFor="profile-timezone">{t('site.profile.timezone')}</label>
              <select id="profile-timezone" value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
                aria-describedby="profile-timezone-hint">
                <option value="">{t('site.profile.timezoneAuto', { zone: browserZone() || '—' })}</option>
                {zoneValue.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
              </select>
              <span className="hint" id="profile-timezone-hint">{t('site.profile.timezoneHint')}</span>
            </div>
            <button className="btn btn-primary btn-block" disabled={prefsBusy}>
              {prefsBusy ? <InlineLoader label={t('site.common.saving')} /> : t('site.profile.savePrefs')}
            </button>
          </form>

          <section className="card card-pad" aria-labelledby="profile-notifs">
            <h2 id="profile-notifs" className="card-title">{t('site.profile.notifications')}</h2>
            <p className="hint mb-2">{t('site.profile.notificationsLead')}</p>
            {['notifEmail', 'notifSms', 'notifPush'].map((key) => (
              <Switch key={key} id={`pref-${key}`} checked={Boolean(user[key])} disabled={notifBusy === key}
                onChange={(v) => setNotif(key, v)} label={t(`site.profile.notif.${key}`)} />
            ))}
            <div className="divider-h" />
            <Switch id="push-toggle" checked={pushOn} disabled={permission === 'unsupported'} onChange={togglePush}
              label={t('site.profile.browserNotif')}
              hint={permission === 'unsupported' ? t('site.profile.pushUnsupported')
                : permission === 'denied' ? t('site.profile.pushDenied') : t('site.profile.browserNotifHint')} />
          </section>

          <form className="card card-pad" onSubmit={changePassword} aria-labelledby="profile-password" noValidate>
            <h2 id="profile-password" className="card-title">{t('site.profile.password')}</h2>
            <div className="field">
              <label htmlFor="current-password">{t('site.profile.currentPassword')}</label>
              <input id="current-password" type="password" value={pass.currentPassword} autoComplete="current-password" required
                onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="new-password">{t('site.reset.newPassword')}</label>
              <input id="new-password" type="password" value={pass.newPassword} autoComplete="new-password" required
                onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} aria-describedby="new-password-strength"
                aria-invalid={(passTried && !newPw.valid) || undefined} />
              <PasswordStrength password={pass.newPassword} id="new-password-strength" />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">{t('site.reset.confirm')}</label>
              <input id="confirm-password" type="password" value={pass.confirm} autoComplete="new-password" required
                onChange={(e) => setPass({ ...pass, confirm: e.target.value })}
                aria-invalid={(pass.confirm !== '' && pass.confirm !== pass.newPassword) || undefined} />
            </div>
            <p className="hint mb-2">{t('site.profile.passwordNote')}</p>
            {passError && <div className="form-error" role="alert">{passError}</div>}
            <button className="btn btn-outline btn-block" disabled={passBusy}>
              {passBusy ? <InlineLoader label={t('site.common.saving')} /> : t('site.profile.updatePassword')}
            </button>
          </form>

          <section className="card card-pad" aria-labelledby="profile-session">
            <h2 id="profile-session" className="card-title">{t('site.profile.session')}</h2>
            <p className="hint mb-2">{t('site.profile.sessionText')}</p>
            <button type="button" className="btn btn-danger-outline btn-block" onClick={doLogout}>{t('nav.logout')}</button>
          </section>
        </div>
      </div>
    </div>
  );
}
