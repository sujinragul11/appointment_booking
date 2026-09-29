import { TIME_RE, hhmm } from './time';

/*
 * Weekly working hours (FR-14). The editor works on a "week": { 1: [window...], ..., 7: [...] }
 * (1 = Monday) where a window is { key, start: 'HH:mm', end: 'HH:mm' }. It is saved atomically
 * with PUT /availability/week { staffId, windows: [{ dayOfWeek, startTime, endTime }] }.
 */

export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAYS_AFTER_MONDAY = [2, 3, 4, 5];

let seq = 0;
export const newKey = () => `w${++seq}`;

export function emptyWeek() {
  return Object.fromEntries(WEEK_DAYS.map((d) => [d, []]));
}

const sameScope = (a, b) => (a ?? null) === (b ?? null);

/** Active windows of one scope (staffId null = the whole business) grouped by weekday. */
export function weekFromWindows(windows = [], staffId = null) {
  const week = emptyWeek();
  windows
    .filter((w) => w && sameScope(w.staffId, staffId) && w.active !== false && week[w.dayOfWeek])
    .forEach((w) => week[w.dayOfWeek].push({ key: newKey(), start: hhmm(w.startTime), end: hhmm(w.endTime) }));
  WEEK_DAYS.forEach((d) => week[d].sort((a, b) => a.start.localeCompare(b.start)));
  return week;
}

/**
 * Validates every window: both times present ('required'), start before end ('order') and no
 * overlap with another window on the same day ('overlap', reported on the later window).
 * Returns { [windowKey]: code }; empty when the week is valid.
 */
export function validateWeek(week) {
  const errors = {};
  WEEK_DAYS.forEach((day) => {
    const list = week?.[day] || [];
    list.forEach((w) => {
      if (!TIME_RE.test(w.start || '') || !TIME_RE.test(w.end || '')) errors[w.key] = 'required';
      else if (w.start >= w.end) errors[w.key] = 'order';
    });
    const valid = list.filter((w) => !errors[w.key]).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    let maxEnd = '';
    valid.forEach((w, i) => {
      if (i > 0 && w.start < maxEnd) errors[w.key] = 'overlap';
      if (w.end > maxEnd) maxEnd = w.end;
    });
  });
  return errors;
}

/** Copies Monday's windows to Tuesday..Friday (replacing what those days had). */
export function copyMondayToWeekdays(week) {
  const next = { ...week };
  WEEKDAYS_AFTER_MONDAY.forEach((d) => {
    next[d] = (week[1] || []).map((w) => ({ key: newKey(), start: w.start, end: w.end }));
  });
  return next;
}

/** A new window for a day: after the day's last window when there is room, else 09:00-17:00. */
export function suggestWindow(list = []) {
  const last = [...list].filter((w) => TIME_RE.test(w.end || '')).sort((a, b) => a.end.localeCompare(b.end)).pop();
  if (last) {
    const [h, m] = last.end.split(':').map(Number);
    const startH = h + (m > 0 ? 1 : 0) + 1;
    if (startH + 1 <= 23) {
      const pad = (n) => String(n).padStart(2, '0');
      return { key: newKey(), start: `${pad(startH)}:00`, end: `${pad(Math.min(startH + 4, 23))}:00` };
    }
  }
  return { key: newKey(), start: '09:00', end: '17:00' };
}

/** Payload windows for PUT /availability/week, sorted by day and start time. */
export function weekToPayload(week) {
  return WEEK_DAYS.flatMap((day) => (week?.[day] || [])
    .map((w) => ({ dayOfWeek: day, startTime: w.start, endTime: w.end }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime)));
}

/** Stable signature used to detect unsaved changes. */
export const weekSignature = (week) => JSON.stringify(weekToPayload(week));

/** Human summary of a day's windows, e.g. "9:00 am – 1:00 pm, 2:00 pm – 6:00 pm". */
export function summarizeWindows(list = [], formatTime) {
  return [...list]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((w) => `${formatTime(w.start)} – ${formatTime(w.end)}`)
    .join(', ');
}

/** Blocked-date entries: whole-day closure, partial closure, or custom working hours. */
export function blockKind(b) {
  if (b?.available) return 'custom';
  return b?.startTime ? 'partial' : 'closed';
}

/** Payload for POST /availability/blocked from the add form. */
export function blockPayload(form) {
  const kind = form.kind || 'closed';
  const timed = kind !== 'closed';
  return {
    date: form.date,
    staffId: form.staffId === '' || form.staffId == null ? null : Number(form.staffId),
    startTime: timed ? form.startTime : null,
    endTime: timed ? form.endTime : null,
    available: kind === 'custom',
    reason: form.reason?.trim() ? form.reason.trim() : null
  };
}

/** Client-side check of the add-blocked-date form; returns { field: code }. */
export function validateBlock(form, today) {
  const errors = {};
  if (!form.date) errors.date = 'required';
  else if (today && form.date < today) errors.date = 'past';
  if ((form.kind || 'closed') !== 'closed') {
    if (!TIME_RE.test(form.startTime || '') || !TIME_RE.test(form.endTime || '')) errors.time = 'required';
    else if (form.startTime >= form.endTime) errors.time = 'order';
  }
  return errors;
}
