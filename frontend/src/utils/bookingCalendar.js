import { addDaysISO, formatTime, isValidTimeZone, parseISODate, timeZoneLabel, toLocalISODate } from './format';

/*
 * Customer-side booking calendar helpers (FR-20). All appointment dates and times are
 * wall-clock values in the provider's IANA time zone; these helpers never convert a
 * calendar date through UTC.
 */

/** Today's calendar date ('yyyy-mm-dd') in an IANA zone; the browser's date without a valid zone. */
export function todayInZone(tz, now = new Date()) {
  if (!isValidTimeZone(tz)) return toLocalISODate(now);
  const parts = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** ISO weekday of a 'yyyy-mm-dd' date: 1 = Monday ... 7 = Sunday (Java's DayOfWeek). */
export function isoWeekday(iso) {
  const d = parseISODate(iso);
  if (!d) return null;
  return d.getDay() === 0 ? 7 : d.getDay();
}

const isFullDay = (b) => !b.startTime;
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Returns `(iso) => boolean` that is true when nobody can take this service on that date.
 * Mirrors the backend's working-window rules (SlotEngine.windows):
 *   - a provider-level full-day block closes the day for everyone;
 *   - provider-level custom hours open the day;
 *   - a staff member works on a day if they have custom hours that date, their own weekly
 *     window for that weekday, or (without own windows that weekday) the provider's hours;
 *     a staff-level full-day block is their day off.
 * `staffIds` are the people who can deliver the service ([] = booked against the provider).
 * Without availability data every day stays enabled and the slot search decides.
 */
export function closedDayChecker(bundle, staffIds = []) {
  if (!bundle || !Array.isArray(bundle.availability)) return () => false;
  const windows = bundle.availability.filter((a) => a && a.active !== false);
  const providerDays = new Set(windows.filter((a) => a.staffId == null).map((a) => Number(a.dayOfWeek)));
  const staffDays = new Map(staffIds.map((id) => [
    String(id),
    new Set(windows.filter((a) => sameId(a.staffId, id)).map((a) => Number(a.dayOfWeek)))
  ]));
  const byDate = new Map();
  (Array.isArray(bundle.blockedDates) ? bundle.blockedDates : []).forEach((b) => {
    if (!b?.date) return;
    const key = String(b.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(b);
  });

  return (iso) => {
    const entries = byDate.get(iso) || [];
    if (entries.some((b) => b.staffId == null && !b.available && isFullDay(b))) return true;
    const dow = isoWeekday(iso);
    const providerOpen = entries.some((b) => b.staffId == null && b.available && !isFullDay(b)) || providerDays.has(dow);
    if (!staffIds.length) return !providerOpen;
    const someoneWorks = staffIds.some((id) => {
      const own = entries.filter((b) => sameId(b.staffId, id));
      if (own.some((b) => !b.available && isFullDay(b))) return false;
      if (own.some((b) => b.available && !isFullDay(b))) return true;
      if (staffDays.get(String(id))?.has(dow)) return true;
      return providerOpen;
    });
    return !someoneWorks;
  };
}

/** First date in [from, to] for which `isOff` is false, or null. */
export function firstOpenDate(from, to, isOff) {
  if (!from || !to) return null;
  for (let d = from, guard = 0; d <= to && guard < 800; d = addDaysISO(d, 1), guard++) {
    if (!isOff(d)) return d;
  }
  return null;
}

/** Bookable range: today in the provider's zone up to `maxDays` ahead (the backend's checkDate). */
export function bookingWindow(tz, maxDays, now = new Date()) {
  const today = todayInZone(tz, now);
  const days = Number(maxDays) > 0 ? Number(maxDays) : 30;
  return { today, maxDate: addDaysISO(today, days) };
}

/* ---------- Display ---------- */

const isEnglish = (locale) => !locale || String(locale).toLowerCase().startsWith('en');

/** A wall-clock 'HH:mm[:ss]' as "10:30 AM" (English) or in the UI language's own format. */
export function formatClock(timeStr, locale) {
  if (!timeStr) return '';
  if (isEnglish(locale)) return formatTime(timeStr);
  const [h, m] = String(timeStr).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(timeStr);
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
  } catch {
    return formatTime(timeStr);
  }
}

/** "Thu, 1 Oct 2026" in the UI language. */
export function formatDay(iso, locale = 'en-IN', { weekday = 'short', year = true } = {}) {
  const d = parseISODate(iso);
  if (!d) return iso || '';
  const opts = { day: 'numeric', month: 'short' };
  if (weekday) opts.weekday = weekday;
  if (year) opts.year = 'numeric';
  try {
    return d.toLocaleDateString(locale, opts);
  } catch {
    return d.toLocaleDateString('en-IN', opts);
  }
}

/**
 * Date, time range and zone of an appointment-like object in the provider's zone:
 * "Thu, 1 Oct 2026 · 10:00 AM – 10:30 AM IST".
 */
export function formatWhen({ date, startTime, endTime, timezone } = {}, locale) {
  if (!date) return '';
  const day = formatDay(date, locale);
  if (!startTime) return day;
  const range = endTime ? `${formatClock(startTime, locale)} – ${formatClock(endTime, locale)}` : formatClock(startTime, locale);
  const zone = isValidTimeZone(timezone) ? ` ${timeZoneLabel(timezone, parseISODate(date) || new Date())}` : '';
  return `${day} · ${range}${zone}`;
}

const wallClock = (instant, timeZone) => new Intl.DateTimeFormat('en-US', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(instant);

/**
 * The moment `startAt` (an ISO instant) on the viewer's own clock — "5:30 AM GMT+1" — or ''
 * when the viewer's clock reads the same as the provider's. The weekday is added when the
 * viewer's date differs.
 */
export function viewerClock(startAt, tz, locale) {
  if (!startAt || !isValidTimeZone(tz)) return '';
  const instant = new Date(startAt);
  if (Number.isNaN(instant.getTime())) return '';
  if (wallClock(instant, tz) === wallClock(instant, undefined)) return '';
  const sameDay = wallClock(instant, tz).slice(0, 10) === wallClock(instant, undefined).slice(0, 10);
  const opts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  if (!sameDay) opts.weekday = 'short';
  try {
    return new Intl.DateTimeFormat(isEnglish(locale) ? 'en-US' : locale, opts).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(instant);
  }
}

/** 'HH:mm' of a 'HH:mm[:ss]' value, for compact URLs and comparisons. */
export const hhmm = (timeStr) => String(timeStr || '').slice(0, 5);

const STAMP = { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' };

/** An ISO instant ("2026-10-01T05:30:00Z") in `timeZone` (default: the viewer's), with the zone name. */
export function formatInstant(instant, locale, timeZone) {
  const d = new Date(instant);
  if (!instant || Number.isNaN(d.getTime())) return '';
  const opts = { ...STAMP, timeZoneName: 'short' };
  if (isValidTimeZone(timeZone)) opts.timeZone = timeZone;
  try {
    return new Intl.DateTimeFormat(locale || 'en-IN', opts).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-IN', opts).format(d);
  }
}

/**
 * A server timestamp without an offset ("2026-09-29T10:19:40.39"), shown on the viewer's clock.
 * The API writes these from a UTC clock, so a value without an offset is read as UTC.
 */
export function formatStamp(value, locale) {
  if (!value) return '';
  const text = String(value);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(text);
  const d = new Date(text.length === 10 ? `${text}T00:00:00` : hasZone ? text : `${text}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString(locale || 'en-IN', STAMP);
  } catch {
    return d.toLocaleString('en-IN', STAMP);
  }
}
