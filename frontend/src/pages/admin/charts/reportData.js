/* ReportResponse (GET /api/admin/reports/bookings) -> the shapes the report charts draw. */

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Daily rows as parallel arrays for the time-series charts. */
export function dailySeries(report) {
  const days = Array.isArray(report?.byDay) ? report.byDay : [];
  return {
    dates: days.map((d) => d.date),
    bookings: days.map((d) => n(d.bookings)),
    cancellations: days.map((d) => n(d.cancellations)),
    revenue: days.map((d) => n(d.revenue))
  };
}

/** Longest period still drawn one bar per day; longer ranges are grouped into weeks. */
export const MAX_DAILY_BARS = 92;

/**
 * The daily rows as chart buckets: one per day, or - past MAX_DAILY_BARS days - one per 7 days
 * counted from the first day (the last week may be shorter). Sums bookings, cancellations and revenue.
 */
export function timeBuckets(report, maxBars = MAX_DAILY_BARS) {
  const d = dailySeries(report);
  const n = d.dates.length;
  const size = n > maxBars ? 7 : 1;
  const rows = [];
  for (let i = 0; i < n; i += size) {
    const last = Math.min(i + size, n) - 1;
    let bookings = 0;
    let cancellations = 0;
    let revenue = 0;
    for (let k = i; k <= last; k += 1) {
      bookings += d.bookings[k];
      cancellations += d.cancellations[k];
      revenue += d.revenue[k];
    }
    rows.push({ start: d.dates[i], end: d.dates[last], bookings, cancellations, revenue: Math.round(revenue * 100) / 100 });
  }
  return { unit: size === 7 ? 'week' : 'day', rows };
}

/**
 * Bookings per hour of day. The backend only lists hours that had bookings; this fills the
 * gaps with zeros over a working-day window (default 08:00-20:00) widened to include the data.
 */
export function hourSeries(byHour, { from = 8, to = 20 } = {}) {
  const counts = new Map((Array.isArray(byHour) ? byHour : []).map((h) => [n(h.hour), n(h.bookings)]));
  const hours = [...counts.keys()].filter((h) => h >= 0 && h <= 23);
  const start = Math.min(from, ...hours);
  const end = Math.max(to, ...hours);
  return Array.from({ length: end - start + 1 }, (_, i) => ({ hour: start + i, bookings: counts.get(start + i) || 0 }));
}

/** Monday..Sunday (ISO 1..7), always seven rows. */
export function weekdaySeries(byWeekday) {
  const counts = new Map((Array.isArray(byWeekday) ? byWeekday : []).map((d) => [n(d.dayOfWeek), n(d.bookings)]));
  return [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, bookings: counts.get(dayOfWeek) || 0 }));
}

/** Status counts with their share of all bookings (one decimal). */
export function statusShares(byStatus) {
  const rows = (Array.isArray(byStatus) ? byStatus : []).map((s) => ({ name: s.name, count: n(s.count) }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return rows.map((r) => ({ ...r, share: total ? Math.round((r.count * 1000) / total) / 10 : 0 }));
}

/** The largest entry of `rows` by `key` (first one wins a tie); null when all are zero. */
export function peak(rows, key) {
  return (rows || []).reduce((best, row) => (n(row[key]) > (best ? n(best[key]) : 0) ? row : best), null);
}

export const sum = (values) => (values || []).reduce((acc, v) => acc + n(v), 0);
