import api from '../api/client';

// FR-36 (optional): browser notifications. There is no server push yet; the navbar's
// unread-count poll calls notifyLatestUnread() when the count goes up.
const PREF_KEY = 'browserNotifications';
const ICON = '/icons/icon.svg';

export function isPushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function pushPermission() {
  return isPushSupported() ? window.Notification.permission : 'unsupported';
}

export function isPushEnabled() {
  if (pushPermission() !== 'granted') return false;
  try {
    return localStorage.getItem(PREF_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Asks for permission (must be called from a user gesture). Resolves to the permission. */
export async function enablePush() {
  if (!isPushSupported()) return 'unsupported';
  let permission = window.Notification.permission;
  if (permission === 'default') permission = await window.Notification.requestPermission();
  if (permission === 'granted') {
    try { localStorage.setItem(PREF_KEY, 'on'); } catch { /* not persisted */ }
  }
  return permission;
}

export function disablePush() {
  try { localStorage.removeItem(PREF_KEY); } catch { /* nothing to clear */ }
}

async function swRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

export async function showBrowserNotification(title, options = {}) {
  if (!isPushEnabled()) return false;
  const opts = { icon: ICON, badge: ICON, ...options };
  const registration = await swRegistration();
  if (registration?.showNotification) {
    await registration.showNotification(title, opts);
    return true;
  }
  // No service worker (dev server): fall back to a page-level notification.
  const n = new window.Notification(title, opts);
  n.onclick = () => {
    window.focus();
    window.location.assign(opts.data?.url || '/notifications');
  };
  return true;
}

/** Fetches notifications and shows the newest unread one. */
export async function notifyLatestUnread() {
  if (!isPushEnabled()) return false;
  try {
    const { data } = await api.get('/notifications');
    const newest = (Array.isArray(data) ? data : [])
      .filter((n) => !n.read)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || (b.id || 0) - (a.id || 0))[0];
    if (!newest) return false;
    return await showBrowserNotification(newest.title || 'Sloto', {
      body: newest.message || '',
      tag: `notification-${newest.id}`,
      data: { url: '/notifications' }
    });
  } catch {
    return false;
  }
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker registration failed', err));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
