import { AxiosError } from 'axios';
import api from '../api/client';

/**
 * Replaces the API client's adapter for a test. `handler({ method, url, params, body })`
 * returns the response body, or `reply(status, body)` for an error / other status.
 * Returns { calls, restore }.
 */
export function fakeApi(handler) {
  const calls = [];
  const original = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    const url = String(config.url || '').split('?')[0];
    let body = config.data;
    if (typeof body === 'string' && body) {
      try { body = JSON.parse(body); } catch { /* not JSON */ }
    }
    const req = { method: config.method, url, params: config.params || {}, body };
    calls.push(req);
    const out = await handler(req);
    const reply = out && out.__reply ? out : { __reply: true, status: 200, data: out === undefined ? {} : out, headers: {} };
    const response = { data: reply.data, status: reply.status, statusText: String(reply.status), headers: reply.headers || {}, config, request: {} };
    if (reply.status >= 400) {
      throw new AxiosError(`Request failed with status code ${reply.status}`, 'ERR_BAD_REQUEST', config, {}, response);
    }
    return response;
  };
  return { calls, restore: () => { api.defaults.adapter = original; } };
}

/** An explicit response: reply(409, { message: 'Taken' }). */
export const reply = (status, data = {}, headers = {}) => ({ __reply: true, status, data, headers });

/** Signs a user in for components that read the session from storage. */
export function signIn(user) {
  localStorage.setItem('accessToken', 'test-token');
  localStorage.setItem('refreshToken', 'test-refresh');
  localStorage.setItem('user', JSON.stringify(user));
}
