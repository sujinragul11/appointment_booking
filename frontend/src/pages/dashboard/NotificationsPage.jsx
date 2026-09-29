import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../utils/format';

const ICONS = { BOOKING: '\u{1F4C5}', PAYMENT: '\u{1F4B3}', REVIEW: '\u2728', REMINDER: '\u23F0', SYSTEM: '\u{1F4E2}' };

export default function NotificationsPage() {
  const [items, setItems] = useState(null);
  const toast = useToast();

  const load = () => api.get('/notifications').then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    await api.put('/notifications/read-all');
    setItems((p) => (p || []).map((n) => ({ ...n, read: true })));
  };

  const markOne = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setItems((p) => (p || []).map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard">My bookings</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/addresses">Addresses</Link>
          <Link to="/notifications" className="active">Notifications</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Notifications</h1>
            <p>Updates about your bookings</p>
          </div>
          {items?.some((n) => !n.read) && (
            <button className="btn btn-outline btn-sm" onClick={markAll}>Mark all as read</button>
          )}
        </div>

        {!items ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div className="empty card card-pad">
            <div className="empty-ico">{'\u{1F4E2}'}</div>
            <h3>Nothing here yet</h3>
            <p className="mt-1">We'll notify you about bookings, payments and updates.</p>
          </div>
        ) : (
          <div className="card">
            {items.map((n) => (
              <div key={n.id} className={`list-item ${!n.read ? 'unread' : ''}`}
                style={{ cursor: 'pointer', background: n.read ? 'transparent' : '#f5f3ff', borderLeft: n.read ? '0' : '3px solid var(--brand-500)' }}
                onClick={() => { if (!n.read) markOne(n.id); }}>
                <div className="avatar" style={{ width: 40, height: 40 }}>{ICONS[n.type] || ICONS.SYSTEM}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: n.read ? 600 : 800 }}>{n.title}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{n.message}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{formatDateTime(n.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}