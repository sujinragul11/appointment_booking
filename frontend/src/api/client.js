import axios from 'axios';
import { loginPath } from '../utils/routes';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

// Credential endpoints: a 401 here means bad credentials or a dead refresh token, so it
// never triggers a refresh (for /auth/refresh itself that would loop). Authenticated
// endpoints under /auth (me, profile, password) refresh like any other request.
const NO_REFRESH = /\/auth\/(login|register|refresh|logout|google|send-otp|verify-otp|forgot-password|reset-password)(?:[/?#]|$)/;

/** JWT `exp` claim in epoch milliseconds, or null when the token can't be decoded. */
export function decodeJwtExp(token) {
  const payload = typeof token === 'string' ? token.split('.')[1] : null;
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof claims.exp === 'number' && claims.exp > 0 ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function setTokens(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  const exp = decodeJwtExp(accessToken);
  if (exp) localStorage.setItem('tokenExpiry', String(exp));
  else localStorage.removeItem('tokenExpiry');
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tokenExpiry');
}

/** Tokens plus the cached user: everything that makes the app think someone is signed in. */
export function clearSession() {
  clearTokens();
  localStorage.removeItem('user');
}

// Called when the session is dead (refresh failed). AuthProvider replaces this with a
// router-aware version; the default does a full-page redirect.
function defaultSessionExpired({ redirect, next }) {
  if (!redirect || /^\/(login|register)(\/|$)/.test(window.location.pathname)) return;
  window.location.assign(loginPath(next));
}

let sessionExpiredHandler = defaultSessionExpired;

export function setSessionExpiredHandler(fn) {
  sessionExpiredHandler = typeof fn === 'function' ? fn : defaultSessionExpired;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && !config.skipAuth) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

/** Single-flight: concurrent callers share one POST /auth/refresh. Resolves to the new access token. */
export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) throw new Error('No refresh token');
      const { data } = await api.post('/auth/refresh', { refreshToken }, { skipAuth: true });
      if (!data?.accessToken) throw new Error('Refresh response has no access token');
      setTokens(data.accessToken, data.refreshToken);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      return data.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function sentToken(config) {
  const header = config.headers?.Authorization || config.headers?.authorization || '';
  return String(header).replace(/^Bearer\s+/i, '');
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retried || NO_REFRESH.test(original.url || '')) {
      return Promise.reject(error);
    }
    original._retried = true;

    let token;
    try {
      // Another request may already have refreshed while this one was in flight.
      const current = localStorage.getItem('accessToken');
      const sent = sentToken(original);
      token = current && sent && current !== sent ? current : await refreshAccessToken();
    } catch (refreshError) {
      // Backend unreachable or failing: keep the session, the user can simply retry.
      const transient = (refreshError?.isAxiosError && !refreshError.response) || refreshError?.response?.status >= 500;
      if (!transient) {
        clearSession();
        sessionExpiredHandler({
          redirect: !original.skipAuthRedirect,
          next: window.location.pathname + window.location.search
        });
      }
      return Promise.reject(error);
    }

    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  }
);

export function getErrorMessage(err, fallback = 'Something went wrong') {
  return err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;
}

export default api;
