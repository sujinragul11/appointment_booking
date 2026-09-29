import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { parseISODate } from '../../utils/format';

/**
 * Reads filters from `defaults` (key -> default value) out of the URL query string.
 * Numbers are parsed as non-negative integers; unknown values fall back to the default.
 */
export function readFilters(params, defaults) {
  const out = {};
  Object.entries(defaults).forEach(([key, def]) => {
    const raw = params.get(key);
    if (raw == null) {
      out[key] = def;
    } else if (typeof def === 'number') {
      const n = Number.parseInt(raw, 10);
      out[key] = Number.isFinite(n) && n >= 0 ? n : def;
    } else {
      out[key] = raw;
    }
  });
  return out;
}

/** The query string for `filters`: values equal to their default (or empty) are left out. */
export function writeFilters(filters, defaults) {
  const next = new URLSearchParams();
  Object.entries(defaults).forEach(([key, def]) => {
    const value = filters[key];
    if (value === undefined || value === null || value === '' || value === def) return;
    next.set(key, String(value));
  });
  return next;
}

/**
 * Filters live in the URL (?status=PENDING&page=2) so views can be linked to, shared and
 * survive a reload. `defaults` must be a module-level constant. setFilters(patch) goes back
 * to the first page unless the patch sets `page` itself.
 */
export function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params, defaults), [params, defaults]);
  const latest = useRef({ filters, setParams });
  latest.current = { filters, setParams };

  const setFilters = useCallback((patch) => {
    const { filters: current, setParams: set } = latest.current;
    const merged = { ...current, ...patch };
    if ('page' in defaults && !('page' in patch)) merged.page = defaults.page;
    set(writeFilters(merged, defaults), { replace: true });
  }, [defaults]);

  return [filters, setFilters];
}

/**
 * Runs `load()` whenever `key` changes. Keeps the previous data while a reload is in flight
 * (so tables and charts do not flash) and ignores responses that arrive out of order.
 */
export function useLoader(load, key) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => loadRef.current())
      .then(
        (data) => { if (id === seq.current) setState({ data, error: null, loading: false }); },
        (error) => { if (id === seq.current) setState((s) => ({ data: s.data, error, loading: false })); }
      );
  }, []);

  useEffect(() => {
    run();
  }, [key, run]);

  useEffect(() => () => { seq.current += 1; }, []);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: run, setData };
}

/** Parses 'yyyy-mm-dd' as a local date and anything else (LocalDateTime / Instant) with Date. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return parseISODate(text);
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DASH = '—';

/** Locale-aware formatters for the admin pages (numbers, INR, dates, weekdays). */
export function useAdminFormat() {
  const { locale } = useI18n();
  return useMemo(() => makeFormatters(locale), [locale]);
}

export function makeFormatters(locale = 'en-IN') {
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const rupees = new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const rupeesPaise = new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rupeesCompact = new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const dateTime = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
  const withDate = (fmt) => (value) => {
    const d = toDate(value);
    return d ? fmt.format(d) : DASH;
  };
  // ISO weekday 1 = Monday ... 7 = Sunday; 1 Jan 2024 was a Monday.
  const weekdayDate = (dow) => new Date(2024, 0, Math.min(Math.max(Number(dow) || 1, 1), 7));

  return {
    number: (n) => integer.format(num(n)),
    decimal: (n) => decimal.format(num(n)),
    /** 1,284 stays exact; 128,400 becomes "1.3L" (en-IN) - for stat tiles and axis ticks. */
    compactNumber: (n) => (Math.abs(num(n)) < 100000 ? integer.format(num(n)) : compact.format(num(n))),
    money: (n) => (Number.isInteger(num(n)) ? rupees : rupeesPaise).format(num(n)),
    compactMoney: (n) => (Math.abs(num(n)) < 100000 ? rupees.format(num(n)) : rupeesCompact.format(num(n))),
    percent: (n) => `${decimal.format(num(n))}%`,
    date: withDate(date),
    dayMonth: withDate(dayMonth),
    longDay: withDate(longDay),
    dateTime: withDate(dateTime),
    /** '14:30:00' -> '2:30 pm' in the viewer's locale. */
    time: (value) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
      return m ? time.format(new Date(2024, 0, 1, Number(m[1]), Number(m[2]))) : DASH;
    },
    hour: (h) => `${String(h).padStart(2, '0')}:00`,
    weekdayShort: (dow) => weekdayShort.format(weekdayDate(dow)),
    weekdayLong: (dow) => weekdayLong.format(weekdayDate(dow))
  };
}

/**
 * Plural-aware lookup: plural('admin.x.bookings', 3) reads 'admin.x.bookings.one' or '.other'
 * (Intl.PluralRules for the current language) and fills {count} with the formatted number.
 */
export function usePlural() {
  const { t, locale } = useI18n();
  return useMemo(() => {
    const rules = new Intl.PluralRules(locale);
    const numbers = new Intl.NumberFormat(locale);
    return (key, count, vars) => {
      const n = Number(count) || 0;
      const values = { ...vars, count: numbers.format(n) };
      const form = rules.select(n) === 'one' ? 'one' : 'other';
      return t(`${key}.${form}`, values);
    };
  }, [t, locale]);
}
