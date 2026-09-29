// Where each role lands after sign-in (or when it opens a page meant for another role).
export function homePathFor(role) {
  if (role === 'ADMIN') return '/dashboard/admin';
  if (role === 'PROVIDER') return '/dashboard/provider';
  if (role === 'STAFF') return '/dashboard/staff';
  if (role === 'CUSTOMER') return '/dashboard';
  return '/';
}

/**
 * Only same-origin, absolute paths are allowed as post-login targets. Rejects
 * protocol-relative ("//evil.com") and backslash tricks ("/\evil.com"), which browsers
 * normalise to another origin.
 */
export function safeRedirect(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f]/.test(path)) return null;
  if (/^\/(login|register)(\/|\?|$)/.test(path)) return null;
  return path;
}

export function loginPath(next) {
  const target = safeRedirect(next);
  return target ? `/login?next=${encodeURIComponent(target)}` : '/login';
}

/** Resolves the post-login target from ?next=... or router state ({ from }). */
export function nextFromLocation(location) {
  const params = new URLSearchParams(location?.search || '');
  const fromParam = safeRedirect(params.get('next'));
  if (fromParam) return fromParam;
  const from = location?.state?.from;
  if (typeof from === 'string') return safeRedirect(from);
  if (from && typeof from.pathname === 'string') return safeRedirect(from.pathname + (from.search || ''));
  return null;
}
