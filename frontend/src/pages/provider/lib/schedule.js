import { toMinutes } from './time';

/** Status order used by the week-grid legend and the status filter. */
export const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

const DAY_MIN = 24 * 60;

/** End of an appointment in minutes; an end at or before the start means "runs to midnight". */
export function endMinutes(a) {
  const start = toMinutes(a?.startTime);
  const end = toMinutes(a?.endTime);
  if (!Number.isFinite(end)) return Number.isFinite(start) ? start + 30 : NaN;
  return end <= start ? DAY_MIN : end;
}

/**
 * Hour range for the week grid: from the earliest working window / appointment to the latest
 * one, rounded out to whole hours. Falls back to `fallback` ([start, end]) when nothing is known.
 */
export function gridHours(windows = [], appointments = [], fallback = [8, 20]) {
  let min = Infinity;
  let max = -Infinity;
  windows.filter((w) => w && w.active !== false).forEach((w) => {
    const s = toMinutes(w.startTime);
    const e = toMinutes(w.endTime);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      min = Math.min(min, s);
      max = Math.max(max, e <= s ? DAY_MIN : e);
    }
  });
  appointments.forEach((a) => {
    const s = toMinutes(a?.startTime);
    const e = endMinutes(a);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      min = Math.min(min, s);
      max = Math.max(max, e);
    }
  });
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { startHour: fallback[0], endHour: fallback[1] };
  }
  const startHour = Math.max(0, Math.floor(min / 60));
  const endHour = Math.min(24, Math.max(Math.ceil(max / 60), startHour + 1));
  return { startHour, endHour };
}

/**
 * Lays out one day's appointments on the grid. Overlapping appointments (including ones that only
 * overlap because of the minimum block height) are placed side by side in lanes.
 * Returns [{ item, start, end, lane, lanes }] with start/end in minutes clipped to the grid.
 */
export function layoutDay(appointments = [], { startHour = 0, endHour = 24, minMinutes = 20 } = {}) {
  const gridStart = startHour * 60;
  const gridEnd = endHour * 60;
  const items = appointments
    .map((item) => {
      const rawStart = toMinutes(item?.startTime);
      const rawEnd = endMinutes(item);
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null;
      const start = Math.max(gridStart, Math.min(rawStart, gridEnd - minMinutes));
      const end = Math.min(gridEnd, Math.max(rawEnd, start + minMinutes));
      return { item, start, end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end || String(a.item.id).localeCompare(String(b.item.id)));

  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const laneEnds = [];
    cluster.forEach((c) => {
      let lane = laneEnds.findIndex((end) => end <= c.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(c.end);
      } else {
        laneEnds[lane] = c.end;
      }
      c.lane = lane;
    });
    cluster.forEach((c) => out.push({ ...c, lanes: laneEnds.length }));
    cluster = [];
    clusterEnd = -Infinity;
  };
  items.forEach((c) => {
    if (cluster.length && c.start >= clusterEnd) flush();
    cluster.push(c);
    clusterEnd = Math.max(clusterEnd, c.end);
  });
  if (cluster.length) flush();
  return out;
}

/** Groups appointments by their date, each day sorted by start time. */
export function groupByDate(appointments = []) {
  const map = {};
  appointments.forEach((a) => {
    (map[a.date] = map[a.date] || []).push(a);
  });
  Object.values(map).forEach((list) => list.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)));
  return map;
}

/** Whether "Record payment collected" applies: money still due and the booking is not cancelled. */
export function canCollect(a) {
  return Boolean(a && a.status !== 'CANCELLED' && Number(a.payment?.balanceDue) > 0);
}

/** Merges a PaymentResponse (from /collect) into its appointment. */
export function withPayment(a, payment) {
  return { ...a, payment, paymentStatus: payment?.status ?? a.paymentStatus };
}
