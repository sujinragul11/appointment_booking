import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Loader from '../../components/Loader';
import AccountNav from '../../components/AccountNav';
import PasswordStrength from '../../components/PasswordStrength';
import { formatDate } from '../../utils/format';
import { checkPassword } from '../../utils/password';
import { disablePush, enablePush, isPushEnabled, pushPermission, showBrowserNotification } from '../../utils/push';

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '' });
  const [passBusy, setPassBusy] = useState(false);
  const [passTried, setPassTried] = useState(false);
  const [pushOn, setPushOn] = useState(isPushEnabled);
  const [permission, setPermission] = useState(pushPermission);

  useEffect(() => {
    if (user) setForm({ name: user.name || '', phone: user.phone || '' });
  }, [user]);

  if (!user) return <Loader />;

  const newPw = checkPassword(pass.newPassword);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put('/auth/profile', { name: form.name, phone: form.phone });
      updateUser(data);
      toast('Profile updated', 'success');
    } catch (err) { toast(getErrorMessage(err), 'error'); } finally { setBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPassTried(true);
    if (!pass.currentPassword || !pass.newPassword) {
      toast('Enter both current and new password', 'error');
      return;
    }
    if (!newPw.valid) {
      toast('The new password does not meet the requirements', 'error');
      return;
    }
    setPassBusy(true);
    try {
      await api.put('/auth/password', pass);
      setPass({ currentPassword: '', newPassword: '' });
      setPassTried(false);
      toast('Password changed', 'success');
    } catch (err) { toast(getErrorMessage(err), 'error'); } finally { setPassBusy(false); }
  };

  const togglePush = async (on) => {
    if (!on) {
      disablePush();
      setPushOn(false);
      toast('Browser notifications turned off', 'info');
      return;
    }
    const result = await enablePush();
    setPermission(result);
    if (result === 'granted') {
      setPushOn(true);
      toast('Browser notifications turned on', 'success');
      showBrowserNotification('Notifications are on', { body: 'You will be alerted about new booking updates.' }).catch(() => {});
    } else if (result === 'denied') {
      toast('Notifications are blocked. Allow them in your browser settings for this site.', 'error');
    }
  };

  const doLogout = async () => {
    if (!confirm('Log out of your account?')) return;
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="dash">
      <AccountNav />

      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Profile</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Manage your personal information</p>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
          <div className="avatar" style={{ width: 72, height: 72, fontSize: '1.8rem', background: 'var(--gradient-soft)', color: 'var(--brand-700)' }} aria-hidden="true">
            {(user.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{user.name}</div>
            <div style={{ color: 'var(--muted)' }}>{user.email} {'•'} {user.role}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Joined {user.createdAt ? formatDate(user.createdAt) : '—'}</div>
          </div>
        </div>

        <div className="profile-grid">
          <form className="card card-pad" onSubmit={saveProfile}>
            <h2 className="card-title">Personal details</h2>
            <div className="field">
              <label htmlFor="profile-name">Full name</label>
              <input id="profile-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="profile-email">Email</label>
              <input id="profile-email" type="email" value={user.email} disabled aria-describedby="profile-email-hint" style={{ opacity: 0.7, cursor: 'not-allowed' }} />
              <span className="hint" id="profile-email-hint">Email is fixed at signup</span>
            </div>
            <div className="field">
              <label htmlFor="profile-phone">Phone</label>
              <input id="profile-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+919876543210" autoComplete="tel" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
          </form>

          <form className="card card-pad" onSubmit={changePassword}>
            <h2 className="card-title">Change password</h2>
            <div className="field">
              <label htmlFor="current-password">Current password</label>
              <input id="current-password" type="password" value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} required autoComplete="current-password" />
            </div>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" type="password" value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })}
                required autoComplete="new-password" aria-describedby="new-password-strength"
                aria-invalid={(passTried && !newPw.valid) || undefined} />
              <PasswordStrength password={pass.newPassword} id="new-password-strength" />
            </div>
            <button className="btn btn-outline btn-block" disabled={passBusy}>{passBusy ? 'Updating...' : 'Update password'}</button>
          </form>

          <div className="card card-pad">
            <h2 className="card-title">Browser notifications</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 14 }}>
              Get a desktop alert when there is news about your bookings while Sloto is open in a tab.
            </p>
            <label className="switch" htmlFor="push-toggle">
              <input id="push-toggle" type="checkbox" role="switch" checked={pushOn}
                disabled={permission === 'unsupported'} onChange={(e) => togglePush(e.target.checked)} />
              <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
              <span>Browser notifications</span>
            </label>
            {permission === 'unsupported' && <p className="hint mt-1">This browser does not support notifications.</p>}
            {permission === 'denied' && <p className="hint mt-1">Blocked in browser settings. Allow notifications for this site to turn them on.</p>}
          </div>

          <form className="card card-pad" onSubmit={(e) => { e.preventDefault(); doLogout(); }}>
            <h2 className="card-title">Session</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 14 }}>Sign out of Sloto on this device.</p>
            <button className="btn btn-danger-outline btn-block">Log out</button>
          </form>
        </div>
      </div>
    </div>
  );
}
