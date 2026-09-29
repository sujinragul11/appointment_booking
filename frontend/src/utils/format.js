export function formatMoney(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatDateTime(s) {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

export function formatDate(s) {
  if (!s) return '-';
  const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(t) {
  if (!t) return '-';
  const [h, m] = String(t).slice(0, 5).split(':');
  let hh = Number(h);
  const am = hh < 12;
  if (hh === 0) hh = 12;
  if (hh > 12) hh -= 12;
  return `${hh}:${m} ${am ? 'AM' : 'PM'}`;
}

/* ---------- Local calendar dates (yyyy-mm-dd) ----------
 * Never use toISOString() for a calendar date: it converts to UTC, so e.g. 00:30 IST
 * on the 5th becomes the 4th. These helpers only use the local date fields.
 */

const pad2 = (n) => String(n).padStart(2, '0');

export function toLocalISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return toLocalISODate(new Date());
}

/** Parses 'yyyy-mm-dd' as local midnight. Returns null for anything else. */
export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

export function addDaysISO(iso, days) {
  const d = parseISODate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

/** Same day-of-month `months` later/earlier, clamped to the target month's length. */
export function addMonthsISO(iso, months) {
  const d = parseISODate(iso);
  if (!d) return iso;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return toLocalISODate(target);
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function nextDays(count, offset = 1) {
  const out = [];
  for (let i = offset; i < offset + count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      iso: toLocalISODate(d),
      dow: DAYS[d.getDay()].slice(0, 3),
      day: d.getDate(),
      month: MONTHS[d.getMonth()],
      isToday: i === 0
    });
  }
  return out;
}

/* ---------- Time zones ----------
 * Appointment dates/times are wall-clock values in the provider's zone. When a provider or
 * appointment carries an (optional) IANA `timezone`, these helpers show that zone explicitly.
 */

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Minutes to add to UTC to get the wall-clock time in `timeZone` at `instant`.
function zoneOffsetMinutes(instant, timeZone) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(instant).forEach((p) => { if (p.type !== 'literal') parts[p.type] = Number(p.value); });
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The instant at which the wall clock in `timeZone` reads `dateStr timeStr`. */
export function zonedTimeToDate(dateStr, timeStr, timeZone) {
  const d = parseISODate(dateStr);
  if (!d) return new Date(NaN);
  const [h = 0, mi = 0, s = 0] = String(timeStr || '00:00').split(':').map(Number);
  const guess = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h, mi, s || 0);
  const first = zoneOffsetMinutes(new Date(guess), timeZone);
  let result = guess - first * 60000;
  const second = zoneOffsetMinutes(new Date(result), timeZone);
  if (second !== first) result = guess - second * 60000;
  return new Date(result);
}

/** Short zone name such as "IST" or "GMT+5:30"; falls back to the IANA id. */
export function timeZoneLabel(tz, at = new Date()) {
  if (!isValidTimeZone(tz)) return tz || '';
  try {
    const part = new Intl.DateTimeFormat('en-IN', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value || tz;
  } catch {
    return tz;
  }
}

/**
 * Formats a provider-local date + time in the given IANA zone, including the zone name,
 * e.g. formatInZone('2026-10-05', '10:30:00', 'Asia/Kolkata') -> "5 Oct 2026, 10:30 am IST".
 * Without a (valid) zone it falls back to the plain local formatting.
 */
export function formatInZone(dateStr, timeStr, tz, locale = 'en-IN') {
  if (!dateStr) return '-';
  const plain = `${formatDate(dateStr)}${timeStr ? `, ${formatTime(timeStr)}` : ''}`;
  if (!isValidTimeZone(tz)) return plain;
  const instant = zonedTimeToDate(dateStr, timeStr, tz);
  if (isNaN(instant)) return plain;
  const opts = { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', timeZoneName: 'short' };
  if (timeStr) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return new Intl.DateTimeFormat(locale, opts).format(instant);
}

/** The same moment in the viewer's own zone, or '' when the viewer's clock reads the same. */
export function formatViewerTime(dateStr, timeStr, tz) {
  if (!isValidTimeZone(tz) || !timeStr) return '';
  const instant = zonedTimeToDate(dateStr, timeStr, tz);
  if (isNaN(instant)) return '';
  // Compare offsets, not zone names: browsers may report aliases (Asia/Calcutta vs Asia/Kolkata).
  if (zoneOffsetMinutes(instant, tz) === -instant.getTimezoneOffset()) return '';
  return instant.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
}

export function initials(name = '') {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
