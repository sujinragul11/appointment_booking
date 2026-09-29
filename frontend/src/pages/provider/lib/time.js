import { addDaysISO, parseISODate, toLocalISODate } from '../../../utils/format';

/*
 * Date / time helpers for the provider and staff portals. Appointment dates and times are
 * wall-clock values in the provider's IANA time zone ("2026-10-01" + "11:00:00"), so
 * "today" must be computed in that zone, not in the browser's.
 */

const pad2 = (n) => String(n).padStart(2, '0');
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function zoneParts(tz, now) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz || undefined, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).formatToParts(now).forEach((p) => { parts[p.type] = p.value; });
  return parts;
}

/** Calendar date 'yyyy-mm-dd' in an IANA zone; the browser's zone when tz is missing or unknown. */
export function todayInZone(tz, now = new Date()) {
  try {
    const p = zoneParts(tz, now);
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return toLocalISODate(now);
  }
}

/** Minutes since midnight on the wall clock of an IANA zone. */
export function minutesNowInZone(tz, now = new Date()) {
  try {
    const p = zoneParts(tz, now);
    return (Number(p.hour) % 24) * 60 + Number(p.minute);
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

/** 'HH:mm' or 'HH:mm:ss' -> minutes since midnight (NaN when malformed). */
export function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes since midnight -> 'HH:mm' (24:00 stays 24:00 for end-of-day). */
export function fromMinutes(min) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** '09:00:00' -> '09:00' */
export const hhmm = (t) => String(t ?? '').slice(0, 5);

/** Localised short time, e.g. '9:00 am' (en-IN) for '09:00:00'. */
export function fmtTime(t, locale = 'en-IN') {
  const min = toMinutes(t);
  if (!Number.isFinite(min)) return t ? String(t) : '';
  const d = new Date(2000, 0, 1, Math.floor(min / 60) % 24, min % 60);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
}

export function fmtTimeRange(start, end, locale) {
  return `${fmtTime(start, locale)} – ${fmtTime(end, locale)}`;
}

/** Localised hour label for axis / gutters, e.g. '9 am'. */
export function fmtHour(hour, locale = 'en-IN') {
  const d = new Date(2000, 0, 1, hour % 24, 0);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(d);
}

/** Localised calendar date for a 'yyyy-mm-dd' string. */
export function fmtDate(iso, locale = 'en-IN', opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseISODate(iso);
  if (!d) return iso ? String(iso) : '';
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

/** Localised date + time for an ISO LocalDateTime ('2026-09-22T10:19:46.12'). */
export function fmtDateTime(value, locale = 'en-IN') {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

/** ISO weekday of a 'yyyy-mm-dd' date: 1 = Monday ... 7 = Sunday. */
export function isoDayOfWeek(iso) {
  const d = parseISODate(iso);
  if (!d) return NaN;
  return ((d.getDay() + 6) % 7) + 1;
}

/** Monday of the week that contains `iso`. */
export function mondayOf(iso) {
  const dow = isoDayOfWeek(iso);
  return Number.isFinite(dow) ? addDaysISO(iso, 1 - dow) : iso;
}

/** The seven dates of the week starting on `monday`. */
export function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

/** Localised weekday name for ISO day 1..7 (Monday = 1). */
export function weekdayName(day, locale = 'en-IN', style = 'long') {
  // 3 Jan 2000 was a Monday
  return new Intl.DateTimeFormat(locale, { weekday: style }).format(new Date(2000, 0, 2 + day));
}

/** Short zone name ("IST", "GMT+1") for display next to the IANA id. */
export function zoneAbbr(tz, locale = 'en-IN', at = new Date()) {
  try {
    const part = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value || '';
  } catch {
    return '';
  }
}

export { addDaysISO, parseISODate };
