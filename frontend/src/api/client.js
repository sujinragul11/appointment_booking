import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

const BUFFER_MS = 20000;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

const refreshNow = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await axios.post('/api/auth/refresh', { refreshToken });
  localStorage.setItem('accessToken', data.accessToken);
  if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const exp = Number(localStorage.getItem('tokenExpiry') || 0);
    const isExpired = exp > 0 && Date.now() < exp;
    const shouldRefresh =
      error.response?.status === 401 &&
      !original._retried &&
      localStorage.getItem('accessToken') &&
      isExpired;
    if (!shouldRefresh) {
      if (window.location.pathname !== '/login' && error.response?.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tokenExpiry');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    original._retried = true;
    try {
      refreshPromise = refreshPromise || refreshNow().finally(() => (refreshPromise = null));
      const token = await refreshPromise;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (e) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenExpiry');
      window.location.href = '/login';
      return Promise.reject(e);
    }
  }
);

export function setTokens(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  const [header, payload] = accessToken.split('.');
  const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  const exp = (claims.exp || 0) * 1000;
  localStorage.setItem('tokenExpiry', String(exp - BUFFER_MS));
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tokenExpiry');
}

export function getErrorMessage(err, fallback = 'Something went wrong') {
  return err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;
}

export default api;