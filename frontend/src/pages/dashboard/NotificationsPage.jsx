import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/client';
import AccountNav from '../../components/AccountNav';
import { useToast } from '../../components/Toast';
import { emitNotificationsChanged } from '../../hooks/useUnreadCount';
import { formatDateTime } from '../../utils/format';

const ICONS = { BOOKING: '\u{1F4C5}', PAYMENT: '\u{1F4B3}', REVIEW: '✨', REMINDER: '⏰', SYSTEM: '\u{1F4E2}' };

export default function NotificationsPage() {
  const [items, setItems] = useState(null);
  const toast = useToast();

  const load = () => api.get('/notifications').then((r) => setItems(r.data || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    try {
      await api.put('/notifications/read-all');
      setItems((p) => (p || []).map((n) => ({ ...n, read: true })));
      emitNotificationsChanged();
    } catch (e) { toast(getErrorMessage(e, 'Could not update notifications'), 'error'); }
  };

  const markOne = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setItems((p) => (p || []).map((n) => (n.id === id ? { ...n, read: true } : n)));
      emitNotificationsChanged();
    } catch (e) { toast(getErrorMessage(e, 'Could not update the notification'), 'error'); }
  };

  return (
    <div className="dash">
      <AccountNav />

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Notifications</h1>
            <p>Updates about your bookings</p>
          </div>
          {items?.some((n) => !n.read) && (
            <button type="button" className="btn btn-outline btn-sm" onClick={markAll}>Mark all as read</button>
          )}
        </div>

        {!items ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div className="empty card card-pad">
            <div className="empty-ico" aria-hidden="true">{'\u{1F4E2}'}</div>
            <h2 style={{ fontSize: '1.15rem' }}>Nothing here yet</h2>
            <p className="mt-1">We'll notify you about bookings, payments and updates.</p>
          </div>
        ) : (
          <ul className="card plain-list">
            {items.map((n) => (
              // Clicking an unread row also marks it read; the button is the keyboard-accessible way.
              <li key={n.id} className={`list-item notif-item ${!n.read ? 'unread' : ''}`}
                onClick={() => { if (!n.read) markOne(n.id); }}>
                <div className="avatar" style={{ width: 40, height: 40 }} aria-hidden="true">{ICONS[n.type] || ICONS.SYSTEM}</div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: n.read ? 600 : 800 }}>
                    {!n.read && <span className="sr-only">Unread: </span>}{n.title}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{n.message}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{formatDateTime(n.createdAt)}</div>
                </div>
                {!n.read && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); markOne(n.id); }}
                    aria-label={`Mark "${n.title}" as read`}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
