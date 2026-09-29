/* Pure geometry for the admin charts (inline SVG). Kept free of React so it can be unit-tested. */

export const BAR_MAX = 24; // bars are never thicker than this (px)
export const CORNER = 4; // rounded data-end radius (px); the baseline end stays square
export const GAP = 2; // surface gap between neighbouring bars and between stacked segments (px)

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const tidy = (v) => Math.round(v * 100) / 100;

/**
 * A clean value axis: the top is rounded up to 1 / 2 / 2.5 / 5 x 10^k so tick labels read
 * 0, 2, 4, 6, 8 rather than 0, 1.75, 3.5... With `integer` (counts) the step is a whole number.
 * An all-zero series still gets a 0..1 axis so nothing divides by zero.
 */
export function niceScale(maxValue, { ticks = 4, integer = false } = {}) {
  const max = Number(maxValue) > 0 ? Number(maxValue) : 0;
  if (max === 0) return { max: 1, step: integer ? 1 : 0.5, ticks: integer ? [0, 1] : [0, 0.5, 1] };
  const raw = max / Math.max(1, ticks);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const factor = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  let step = factor * magnitude;
  if (integer) step = Math.max(1, Math.ceil(step));
  const count = Math.ceil(tidy(max / step));
  const top = tidy(count * step);
  return { max: top, step, ticks: Array.from({ length: count + 1 }, (_, i) => tidy(i * step)) };
}

/** y position of value v on a 0..max axis drawn from `top` down to `top + height`. */
export function valueY(v, max, top, height) {
  const value = Math.max(0, Number(v) || 0);
  return tidy(top + height - (max > 0 ? (Math.min(value, max) / max) * height : 0));
}

/**
 * Column layout: n equal bands; each bar is at most BAR_MAX wide and never fills its band, so
 * neighbours always keep at least the GAP of surface between them (dense axes get thin bars).
 */
export function bandLayout(n, left, width, { maxBar = BAR_MAX, fill = 0.64 } = {}) {
  const band = n > 0 ? width / n : width;
  const bar = tidy(Math.max(1, Math.min(maxBar, band * fill, band - GAP)));
  return {
    band,
    bar,
    x: (i) => tidy(left + band * i + (band - bar) / 2),
    center: (i) => tidy(left + band * i + band / 2)
  };
}

/** Band index under pixel `px` (the whole band is the hit target, not just the bar). */
export function bandIndex(px, n, left, width) {
  if (n <= 1) return 0;
  return clamp(Math.floor((px - left) / (width / n)), 0, n - 1);
}

/** A column (or top stack segment) with a rounded data end and a square base. Empty when h <= 0. */
export function columnPath(x, y, width, baseY, radius = CORNER) {
  const h = baseY - y;
  if (!(h > 0) || !(width > 0)) return '';
  const r = tidy(Math.min(radius, width / 2, h));
  const right = tidy(x + width);
  return `M${x} ${baseY} V${tidy(y + r)} Q${x} ${y} ${tidy(x + r)} ${y} H${tidy(right - r)} Q${right} ${y} ${right} ${tidy(y + r)} V${baseY} Z`;
}

/** A square-cornered segment (lower parts of a stack). */
export function rectPath(x, y, width, baseY) {
  if (!(baseY - y > 0) || !(width > 0)) return '';
  return `M${x} ${baseY} V${y} H${tidy(x + width)} V${baseY} Z`;
}

/**
 * Stacked column geometry for band i: one entry per series with its [top, bottom] pixels.
 * Only the highest non-empty segment gets the rounded data end; `gaps` are the y positions of
 * internal boundaries, where a GAP-wide surface line separates the segments.
 */
export function stackSegments(values, max, top, height) {
  const baseY = tidy(top + height);
  let bottom = baseY;
  let running = 0;
  const segments = values.map((v) => {
    const value = Math.max(0, Number(v) || 0);
    running += value;
    const y = valueY(running, max, top, height);
    const seg = { value, top: y, bottom, rounded: false };
    bottom = y;
    return seg;
  });
  const filled = segments.filter((s) => s.value > 0);
  if (filled.length) filled[filled.length - 1].rounded = true;
  const gaps = filled.slice(0, -1).map((s) => s.top);
  return { segments, gaps, total: running, top: bottom };
}

/**
 * Evenly spaced label indices (always the first and the last) so axis labels never collide:
 * the last label is right-aligned to its bar, so a regular tick closer than one step to it is dropped.
 */
export function tickIndices(n, maxTicks = 6) {
  if (n <= 0) return [];
  const limit = Math.max(2, maxTicks);
  if (n <= limit) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / (limit - 1));
  const out = [];
  for (let i = 0; i < n - 1; i += step) out.push(i);
  if (out.length > 1 && n - 1 - out[out.length - 1] < step) out.pop();
  out.push(n - 1);
  return out;
}

/** Indices of the largest value (ties included); none when everything is zero. */
export function maxIndices(values) {
  const max = Math.max(0, ...values.map((v) => Number(v) || 0));
  if (max <= 0) return [];
  return values.reduce((acc, v, i) => ((Number(v) || 0) === max ? [...acc, i] : acc), []);
}
