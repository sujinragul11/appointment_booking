import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/client';
import AccountNav from '../../components/AccountNav';
import { InlineLoader } from '../../components/Loader';
import { useToast } from '../../components/Toast';
import { emitNotificationsChanged } from '../../hooks/useUnreadCount';
import { useI18n } from '../../i18n';
import { formatStamp } from '../../utils/bookingCalendar';
import { tp } from '../../utils/plural';

const ICONS = { BOOKING: '\u{1F4C5}', PAYMENT: '\u{1F4B3}', REVIEW: '✨', REMINDER: '⏰', ADMIN: '\u{1F6E1}', INFO: '\u{1F4E2}' };

/** Only in-app paths are followed; anything else is ignored. */
const safeLink = (link) => (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : null);

/** FR-35: in-app notifications — open, mark read, mark all read, delete. */
export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    setError('');
    return api.get('/notifications')
      .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
      .catch((e) => { setItems((prev) => prev || []); setError(getErrorMessage(e, t('site.notifications.loadFailed'))); });
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const markOne = async (n) => {
    if (n.read) return true;
    try {
      await api.put(`/notifications/${n.id}/read`);
      setItems((list) => (list || []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      emitNotificationsChanged();
      return true;
    } catch (e) {
      toast(getErrorMessage(e, t('site.notifications.updateFailed')), 'error');
      return false;
    }
  };

  const open = async (n) => {
    const link = safeLink(n.link);
    await markOne(n);
    if (link) navigate(link);
  };

  const markAll = async () => {
    try {
      await api.put('/notifications/read-all');
      setItems((list) => (list || []).map((x) => ({ ...x, read: true })));
      emitNotificationsChanged();
      setStatus(t('site.notifications.allRead'));
    } catch (e) {
      toast(getErrorMessage(e, t('site.notifications.updateFailed')), 'error');
    }
  };

  const remove = async (n) => {
    setBusyId(n.id);
    try {
      await api.delete(`/notifications/${n.id}`);
      setItems((list) => (list || []).filter((x) => x.id !== n.id));
      emitNotificationsChanged();
      setStatus(t('site.notifications.deleted', { title: n.title }));
    } catch (e) {
      toast(getErrorMessage(e, t('site.notifications.updateFailed')), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const unread = (items || []).filter((n) => !n.read).length;

  return (
    <div className="dash">
      <AccountNav />

      <div className="dash-main">
        <div className="section-title">
          <div>
            <h1 className="dash-title">{t('site.notifications.title')}</h1>
            <p>{items ? tp(t, 'site.notifications.unreadCount', { count: unread }) : t('site.notifications.lead')}</p>
          </div>
          {unread > 0 && (
            <button type="button" className="btn btn-outline btn-sm" onClick={markAll}>{t('site.notifications.markAll')}</button>
          )}
        </div>
        <p className="sr-only" role="status" aria-live="polite">{status}</p>

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
              <div className="empty-ico" aria-hidden="true">{'\u{1F4E2}'}</div>
              <h2 className="empty-title">{t('site.notifications.empty')}</h2>
              <p className="mt-1">{t('site.notifications.emptyText')}</p>
            </div>
          )
        ) : (
          <ul className="card plain-list notif-list">
            {items.map((n) => {
              const link = safeLink(n.link);
              return (
                <li key={n.id} className={`notif-row ${n.read ? '' : 'unread'}`}>
                  <span className="avatar notif-ico" aria-hidden="true">{ICONS[n.type] || ICONS.INFO}</span>
                  <div className="notif-body">
                    <h2 className="notif-title">
                      <button type="button" className="notif-open" onClick={() => open(n)}>
                        {!n.read && <span className="sr-only">{t('site.notifications.unread')}: </span>}
                        {n.title}
                        {link && <span className="sr-only"> ({t('site.notifications.opens')})</span>}
                      </button>
                    </h2>
                    {n.message && <p className="notif-message">{n.message}</p>}
                    <p className="notif-time">{formatStamp(n.createdAt, locale)}</p>
                  </div>
                  <div className="notif-actions">
                    {!n.read && (
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => markOne(n)}
                        aria-label={t('site.notifications.markReadAria', { title: n.title })}>
                        {t('site.notifications.markRead')}
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-xs danger-text" onClick={() => remove(n)} disabled={busyId === n.id}
                      aria-label={t('site.notifications.deleteAria', { title: n.title })}>
                      {busyId === n.id ? <InlineLoader label={t('site.common.working')} /> : t('site.notifications.delete')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
