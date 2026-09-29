import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import api from '../../api/client';
import { I18nProvider } from '../../i18n';
import { ToastProvider } from '../../components/Toast';

/*
 * Test helpers for the provider / staff portal pages: a fake backend plugged in as the axios
 * adapter (so the real client, interceptors and API module run) and a router + i18n wrapper.
 */

/**
 * Installs a fake backend. `handler(method, path, { params, body })` returns the response body,
 * or throws `httpError(...)`. Returns the list of recorded calls. Call the returned `restore`
 * in afterEach (or rely on the next install).
 */
export function fakeBackend(handler) {
  const calls = [];
  const original = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    const path = config.url.split('?')[0];
    let body;
    try {
      body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    } catch {
      body = config.data;
    }
    const call = { method: config.method, path, params: config.params || {}, body };
    calls.push(call);
    try {
      const data = await handler(config.method, path, call);
      return { data: data ?? {}, status: 200, statusText: 'OK', headers: {}, config, request: {} };
    } catch (err) {
      if (err && err.isHttpError) {
        const error = new Error(`Request failed with status code ${err.status}`);
        error.isAxiosError = true;
        error.config = config;
        error.response = { status: err.status, data: err.data, headers: {}, config };
        throw error;
      }
      throw err;
    }
  };
  calls.restore = () => { api.defaults.adapter = original; };
  return calls;
}

export function httpError(status, data) {
  return { isHttpError: true, status, data };
}

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

/** Renders `element` at `path` (matched by `route`, default = path without the query). */
export function renderAt(element, { path = '/', route } = {}) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  return render(
    <I18nProvider initialLanguage="en">
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <Routes>
            <Route path={route || path.split('?')[0]} element={element} />
            <Route path="*" element={<p>other page</p>} />
          </Routes>
          <Where />
        </ToastProvider>
      </MemoryRouter>
    </I18nProvider>
  );
}
