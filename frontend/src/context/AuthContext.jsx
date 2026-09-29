import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setTokens, clearSession, getErrorMessage, setSessionExpiredHandler } from '../api/client';
import { loginPath } from '../utils/routes';

const AuthContext = createContext(null);

function readStoredUser() {
  // A cached user without an access token is a leftover of a dead session: treat as logged out.
  if (!localStorage.getItem('accessToken')) {
    localStorage.removeItem('user');
    return null;
  }
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('accessToken')));

  const saveUser = useCallback((u) => {
    setUser(u || null);
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
  }, []);

  // The API client calls this when a token refresh fails (storage is already cleared).
  useEffect(() => {
    setSessionExpiredHandler(({ redirect, next }) => {
      setUser(null);
      if (redirect && !/^\/(login|register)(\/|$)/.test(window.location.pathname)) {
        navigate(loginPath(next), { replace: true, state: { sessionExpired: true } });
      }
    });
    return () => setSessionExpiredHandler(null);
  }, [navigate]);

  const fetchMe = useCallback(async () => {
    try {
      // No redirect on failure: a dead session on a public page just means "signed out".
      const { data } = await api.get('/auth/me', { skipAuthRedirect: true });
      saveUser(data);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        clearSession();
        setUser(null);
      }
      // Network/server errors keep the cached user; the next request will retry.
    } finally {
      setLoading(false);
    }
  }, [saveUser]);

  useEffect(() => {
    if (localStorage.getItem('accessToken')) fetchMe();
    else setLoading(false);
  }, [fetchMe]);

  const startSession = useCallback((data) => {
    setTokens(data.accessToken, data.refreshToken);
    saveUser(data.user);
    return data.user;
  }, [saveUser]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    return startSession(data);
  }, [startSession]);

  // /auth/register answers with the same { accessToken, refreshToken, user } as /auth/login.
  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (data?.accessToken && data?.user) startSession(data);
    return data;
  }, [startSession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') }, { timeout: 5000 });
    } catch {
      // best effort: the local session is cleared either way
    }
    clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((u) => saveUser(u), [saveUser]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser, fetchMe, errorMessage: getErrorMessage }),
    [user, loading, login, register, logout, updateUser, fetchMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
