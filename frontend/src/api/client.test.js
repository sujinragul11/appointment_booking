import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import api, { decodeJwtExp, setSessionExpiredHandler, setTokens } from './client';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`;

const OLD = jwt({ sub: 'customer@booking.com', exp: 1700000000 });
const NEW = jwt({ sub: 'customer@booking.com', exp: 2000000000 });

function reply(config, status, data) {
  const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status < 400) return Promise.resolve(response);
  return Promise.reject(new AxiosError(`Request failed with status code ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, {}, response));
}

const authOf = (config) => config.headers?.get?.('Authorization') ?? config.headers?.Authorization;

/**
 * Installs a fake backend as the axios adapter. It accepts `Bearer NEW` only; everything
 * else is a 401. /auth/refresh is answered by `refresh(config)`.
 */
function fakeBackend({ refresh, accept = NEW }) {
  const calls = [];
  api.defaults.adapter = vi.fn(async (config) => {
    calls.push({ method: config.method, url: config.url, auth: authOf(config) });
    if (config.url === '/auth/refresh') return refresh(config);
    if (authOf(config) === `Bearer ${accept}`) return reply(config, 200, { ok: true, url: config.url });
    return reply(config, 401, { message: 'Unauthorized' });
  });
  return calls;
}

const refreshCalls = (calls) => calls.filter((c) => c.url === '/auth/refresh');

let originalAdapter;
let onExpired;

beforeEach(() => {
  originalAdapter = api.defaults.adapter;
  onExpired = vi.fn();
  setSessionExpiredHandler(onExpired);
  setTokens(OLD, 'refresh-1');
  localStorage.setItem('user', JSON.stringify({ id: 1, role: 'CUSTOMER' }));
  window.history.replaceState(null, '', '/dashboard?tab=past');
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setSessionExpiredHandler(null);
});

describe('decodeJwtExp', () => {
  it('returns exp in milliseconds', () => {
    expect(decodeJwtExp(NEW)).toBe(2000000000 * 1000);
  });

  it('handles base64url payloads', () => {
    const token = jwt({ exp: 1900000000, name: '??>>~~ü' }); // produces "-" and "_" characters
    expect(decodeJwtExp(token)).toBe(1900000000 * 1000);
  });

  it('returns null for malformed tokens or a missing exp', () => {
    expect(decodeJwtExp('not-a-jwt')).toBeNull();
    expect(decodeJwtExp('a.%%%.c')).toBeNull();
    expect(decodeJwtExp(jwt({ sub: 'x' }))).toBeNull();
    expect(decodeJwtExp(undefined)).toBeNull();
  });

  it('setTokens stores tokenExpiry from the exp claim', () => {
    setTokens(NEW, 'r');
    expect(localStorage.getItem('tokenExpiry')).toBe(String(2000000000 * 1000));
  });
});

describe('401 handling', () => {
  it('refreshes once, stores the new tokens and retries the request', async () => {
    const calls = fakeBackend({
      refresh: (config) => {
        expect(JSON.parse(config.data)).toEqual({ refreshToken: 'refresh-1' });
        return reply(config, 200, {
          accessToken: NEW, refreshToken: 'refresh-2', tokenType: 'Bearer', user: { id: 1, role: 'CUSTOMER', name: 'Rajesh' }
        });
      }
    });

    const res = await api.get('/appointments/my');

    expect(res.data).toEqual({ ok: true, url: '/appointments/my' });
    expect(calls.map((c) => [c.url, c.auth])).toEqual([
      ['/appointments/my', `Bearer ${OLD}`],
      ['/auth/refresh', undefined], // refresh is sent without the expired access token
      ['/appointments/my', `Bearer ${NEW}`]
    ]);
    expect(localStorage.getItem('accessToken')).toBe(NEW);
    expect(localStorage.getItem('refreshToken')).toBe('refresh-2');
    expect(localStorage.getItem('tokenExpiry')).toBe(String(2000000000 * 1000));
    expect(JSON.parse(localStorage.getItem('user')).name).toBe('Rajesh');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('shares a single refresh between concurrent 401s', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = fakeBackend({
      refresh: async (config) => {
        await gate;
        return reply(config, 200, { accessToken: NEW, refreshToken: 'refresh-2' });
      }
    });

    const pending = Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    await vi.waitFor(() => expect(refreshCalls(calls)).toHaveLength(1));
    release();
    const results = await pending;

    expect(results.map((r) => r.data.url)).toEqual(['/a', '/b', '/c']);
    expect(refreshCalls(calls)).toHaveLength(1);
  });

  it('keeps the refresh token when the refresh response does not rotate it', async () => {
    fakeBackend({ refresh: (config) => reply(config, 200, { accessToken: NEW }) });
    await api.get('/appointments/my');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-1');
  });

  it('clears the whole session and redirects to login with the current path when refresh fails', async () => {
    const calls = fakeBackend({ refresh: (config) => reply(config, 401, { message: 'Invalid refresh token' }) });

    await expect(api.get('/appointments/my')).rejects.toMatchObject({ response: { status: 401 } });

    ['accessToken', 'refreshToken', 'tokenExpiry', 'user'].forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledWith({ redirect: true, next: '/dashboard?tab=past' });
    expect(refreshCalls(calls)).toHaveLength(1);
  });

  it('fails the same way when there is no refresh token at all', async () => {
    localStorage.removeItem('refreshToken');
    const calls = fakeBackend({ refresh: () => { throw new Error('should not be called'); } });

    await expect(api.get('/appointments/my')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls(calls)).toHaveLength(0);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(onExpired).toHaveBeenCalledWith({ redirect: true, next: '/dashboard?tab=past' });
  });

  it('lets a request opt out of the redirect (session is still cleared)', async () => {
    fakeBackend({ refresh: (config) => reply(config, 401, {}) });

    await expect(api.get('/auth/me', { skipAuthRedirect: true })).rejects.toBeTruthy();
    expect(onExpired).toHaveBeenCalledWith({ redirect: false, next: '/dashboard?tab=past' });
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('keeps the session when the refresh endpoint is down (5xx)', async () => {
    fakeBackend({ refresh: (config) => reply(config, 503, {}) });

    await expect(api.get('/appointments/my')).rejects.toMatchObject({ response: { status: 401 } });
    expect(localStorage.getItem('accessToken')).toBe(OLD);
    expect(localStorage.getItem('refreshToken')).toBe('refresh-1');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('never refreshes for credential endpoints like /auth/login', async () => {
    const calls = fakeBackend({ refresh: () => { throw new Error('should not be called'); } });

    await expect(api.post('/auth/login', { email: 'x@y.z', password: 'nope' })).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls(calls)).toHaveLength(0);
    expect(localStorage.getItem('accessToken')).toBe(OLD);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('does not loop when the retried request is rejected again', async () => {
    const calls = fakeBackend({
      accept: 'something-else',
      refresh: (config) => reply(config, 200, { accessToken: NEW, refreshToken: 'refresh-2' })
    });

    await expect(api.get('/appointments/my')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls(calls)).toHaveLength(1);
    expect(calls.filter((c) => c.url === '/appointments/my')).toHaveLength(2);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('passes other errors straight through', async () => {
    api.defaults.adapter = vi.fn((config) => reply(config, 500, { message: 'boom' }));
    await expect(api.get('/providers')).rejects.toMatchObject({ response: { status: 500 } });
    expect(localStorage.getItem('accessToken')).toBe(OLD);
  });
});
