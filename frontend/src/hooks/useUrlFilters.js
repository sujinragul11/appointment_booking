import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The URL is the source of truth for search filters. `update({ key: value })` sets or (for
 * '', null, undefined) removes parameters; any change other than `page` goes back to page 1.
 */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const update = useCallback((changes, { replace = false } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      });
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace });
  }, [setParams]);
  return [params, update];
}

/**
 * A text box bound to a URL parameter: typing commits after a short pause (not on every
 * keystroke); changes of the URL from outside (back/forward, links) refill the box.
 */
export function useDebouncedField(value, commit, delay = 400) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committed.current) return undefined;
    const timer = setTimeout(() => {
      committed.current = text;
      commitRef.current(text);
    }, delay);
    return () => clearTimeout(timer);
  }, [text, delay]);

  return [text, setText];
}

/** Non-negative page number from a URL parameter. */
export const pageParam = (params) => Math.max(0, parseInt(params.get('page'), 10) || 0);
