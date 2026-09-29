import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import Loader from '../../components/Loader';
import { formatDate } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '' });
  const [passBusy, setPassBusy] = useState(false);

  useEffect(() => {
    if (user) setForm({ name: user.name || '', phone: user.phone || '' });
  }, [user]);

  if (!user) return <Loader />;

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
    if (!pass.currentPassword || !pass.newPassword) {
      toast('Enter both current and new password', 'error');
      return;
    }
    setPassBusy(true);
    try {
      await api.put('/auth/password', pass);
      setPass({ currentPassword: '', newPassword: '' });
      toast('Password changed', 'success');
    } catch (err) { toast(getErrorMessage(err), 'error'); } finally { setPassBusy(false); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard">My bookings</Link>
          <Link to="/profile" className="active">Profile</Link>
          <Link to="/addresses">Addresses</Link>
          <Link to="/notifications">Notifications</Link>
        </nav>
      </aside>

      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Profile</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Manage your personal information</p>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
          <div className="avatar" style={{ width: 72, height: 72, fontSize: '1.8rem', background: 'var(--gradient-soft)', color: 'var(--brand-700)' }}>
            {(user.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{user.name}</div>
            <div style={{ color: 'var(--muted)' }}>{user.email} {'\u2022'} {user.role}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Joined {user.createdAt ? formatDate(user.createdAt) : '\u2014'}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
          <form className="card card-pad" onSubmit={saveProfile}>
            <h3 style={{ fontWeight: 800, marginBottom: 14 }}>Personal details</h3>
            <div className="field">
              <label>Full name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={user.email} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
              <span className="hint">Email is fixed at signup</span>
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
          </form>

          <form className="card card-pad" onSubmit={changePassword}>
            <h3 style={{ fontWeight: 800, marginBottom: 14 }}>Change password</h3>
            <div className="field">
              <label>Current password</label>
              <input type="password" value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} required autoComplete="current-password" />
            </div>
            <div className="field">
              <label>New password</label>
              <input type="password" value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} required minLength={6} autoComplete="new-password" />
            </div>
            <button className="btn btn-outline btn-block" disabled={passBusy}>{passBusy ? 'Updating...' : 'Update password'}</button>
          </form>

          <form className="card card-pad" onSubmit={(e) => { e.preventDefault(); if (confirm('Log out of your account?')) { logout(); } }}>
            <h3 style={{ fontWeight: 800, marginBottom: 14 }}>Session</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 14 }}>Sign out of Sloto on this device.</p>
            <button className="btn btn-danger-outline btn-block">Log out</button>
          </form>
        </div>
      </div>
    </div>
  );
}