import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { isPushEnabled, notifyLatestUnread } from '../utils/push';

export const NOTIFICATIONS_CHANGED = 'notifications:changed';
const POLL_MS = 30000;

/** Tell the navbar badge to refresh now (e.g. after marking notifications read). */
export function emitNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/**
 * Unread notification count for the signed-in user: polled every 30s and refreshed on the
 * 'notifications:changed' window event. When the count goes up and browser notifications are
 * enabled, the newest unread notification is shown as a system notification.
 */
export default function useUnreadCount(user) {
  const [unread, setUnread] = useState(0);
  const last = useRef(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    last.current = null;
    if (!userId) {
      setUnread(0);
      return undefined;
    }
    let active = true;

    const refresh = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count', { skipAuthRedirect: true });
        if (!active) return;
        const count = Number(data?.unread ?? data?.count ?? 0) || 0;
        const previous = last.current;
        last.current = count;
        setUnread(count);
        if (previous !== null && count > previous && isPushEnabled()) notifyLatestUnread();
      } catch {
        // offline or signed out: keep the last known value
      }
    };

    refresh();
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [userId]);

  return unread;
}
