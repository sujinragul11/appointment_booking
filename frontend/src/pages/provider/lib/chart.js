/* Pure helpers for the inline-SVG charts (no chart library). */

/** Clean axis ticks from 0 to a round number >= max (steps of 1, 2 or 5 x 10^n). */
export function niceTicks(max, target = 4, integer = true) {
  const m = Number(max);
  if (!(m > 0)) return [0, 1];
  const raw = m / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map((s) => s * pow).find((s) => s >= raw) || 10 * pow;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(m / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Show every n-th x label so labels of `labelWidth` px never collide in bands of `band` px. */
export function labelStride(count, band, labelWidth = 44) {
  if (count <= 0 || band <= 0) return 1;
  const stride = Math.ceil(labelWidth / band);
  // prefer strides that read naturally on a calendar (1, 2, 7, 14, 30 ...)
  const nice = [1, 2, 3, 7, 14, 30, 60, 90, 180];
  return nice.find((n) => n >= stride) || stride;
}

/** Column with a rounded data-end (top) and a square baseline; r is clamped to the bar. */
export function columnPath(x, y, w, h, r = 4) {
  if (!(w > 0) || !(h > 0)) return '';
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Index of the maximum value (first one on ties); -1 when all are 0 / empty. */
export function maxIndex(values = []) {
  let best = -1;
  let bestValue = 0;
  values.forEach((v, i) => {
    if (Number(v) > bestValue) {
      best = i;
      bestValue = Number(v);
    }
  });
  return best;
}

/** Hour rows 0..23 -> the continuous range worth plotting (padded by one hour each side). */
export function hourRange(rows = [], pad = 1) {
  const hours = rows.filter((r) => Number(r.bookings) > 0).map((r) => Number(r.hour));
  if (!hours.length) return [];
  const from = Math.max(0, Math.min(...hours) - pad);
  const to = Math.min(23, Math.max(...hours) + pad);
  const byHour = Object.fromEntries(rows.map((r) => [Number(r.hour), Number(r.bookings) || 0]));
  return Array.from({ length: to - from + 1 }, (_, i) => ({ hour: from + i, bookings: byHour[from + i] || 0 }));
}

/**
 * Report rows per day -> chart bins. Up to `maxDays` days stay daily; longer ranges are summed
 * per week (keyed by the week's Monday) so columns stay readable.
 */
export function binDays(rows = [], mondayOf, maxDays = 92) {
  if (rows.length <= maxDays) return { unit: 'day', bins: rows.map((r) => ({ ...r, key: r.date })) };
  const map = new Map();
  rows.forEach((r) => {
    const key = mondayOf(r.date);
    const bin = map.get(key) || { key, date: key, bookings: 0, cancellations: 0, revenue: 0 };
    bin.bookings += Number(r.bookings) || 0;
    bin.cancellations += Number(r.cancellations) || 0;
    bin.revenue = Math.round((bin.revenue + (Number(r.revenue) || 0)) * 100) / 100;
    map.set(key, bin);
  });
  return { unit: 'week', bins: [...map.values()] };
}
