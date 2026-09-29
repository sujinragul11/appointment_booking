import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `loader` when `deps` change (and on reload()). Stale responses are ignored, so a slow
 * earlier request can never overwrite a newer one. The previous data is kept while reloading,
 * so screens can hold their frame instead of flashing a spinner.
 */
export default function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(loader);
  latest.current = loader;

  useEffect(() => {
    let alive = true;
    setState((s) => (s.loading && !s.error ? s : { ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => latest.current())
      .then(
        (data) => { if (alive) setState({ data, error: null, loading: false }); },
        (error) => { if (alive) setState((s) => ({ data: s.data, error, loading: false })); }
      );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((next) => {
    setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next }));
  }, []);

  return { ...state, reload, setData };
}

/** Field errors from a backend validation response ({ errors: { field: message } }). */
export function fieldErrorsOf(err) {
  const errors = err?.response?.data?.errors;
  return errors && typeof errors === 'object' ? errors : {};
}
