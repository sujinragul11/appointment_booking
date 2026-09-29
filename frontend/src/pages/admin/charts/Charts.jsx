import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n';
import {
  bandIndex, bandLayout, columnPath, maxIndices, niceScale, rectPath, stackSegments, tickIndices, valueY
} from './geometry';

/*
 * Small inline-SVG charts for the admin panel (no chart library).
 * - Series colours come from CSS roles (--viz-1, --viz-2 in admin.css): validated categorical
 *   slots with their own dark-mode steps. Text always uses ink tokens, never a series colour.
 * - Every chart has a text summary, a keyboard-readable plot (arrow keys move a readout that is
 *   announced) and a "show data table" twin, so no value depends on hover or on colour.
 */

/** Rendered width of the plot container (ResizeObserver); `fallback` where layout is unavailable (tests). */
export function useChartWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Approximate label widths so the value axis gets just enough room.
const TICK_CHAR = 6.6;
const leftMargin = (labels) => Math.max(26, Math.round(Math.max(...labels.map((l) => String(l).length)) * TICK_CHAR + 12));

function useChartIds(id) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const base = id || `adm-viz-${uid}`;
  return { title: `${base}-title`, summary: `${base}-summary`, table: `${base}-table`, caption: `${base}-caption` };
}

/** Keyboard + pointer readout: arrow keys / Home / End move it, Escape or leaving clears it. */
function useReadout(count, describe) {
  const [active, setActive] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const onKeyDown = (e) => {
    if (!count) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = active == null ? 0 : Math.min(count - 1, active + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = active == null ? count - 1 : Math.max(0, active - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else if (e.key === 'Escape' && active != null) {
      e.preventDefault();
      setActive(null);
      setAnnouncement('');
      return;
    }
    if (next == null) return;
    e.preventDefault();
    setActive(next);
    setAnnouncement(describe(next));
  };

  return {
    active,
    setActive,
    announcement,
    handlers: {
      onKeyDown,
      onBlur: () => { setActive(null); setAnnouncement(''); }
    }
  };
}

function Tooltip({ x, top, width, heading, rows }) {
  // Flip to the left of the mark in the right part of the plot so it never overflows.
  const flip = x > width * 0.58;
  return (
    <div className={`adm-viz-tooltip ${flip ? 'is-flipped' : ''}`} style={{ left: `${x}px`, top: `${top}px` }} aria-hidden="true">
      <div className="adm-viz-tooltip-head">{heading}</div>
      {rows.map((row) => (
        <div key={row.key} className="adm-viz-tooltip-row">
          {row.tone ? <span className={`adm-viz-key-line adm-viz-bg-${row.tone}`} /> : null}
          <strong>{row.value}</strong>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

/** "Show data table" toggle + the table itself (a keyboard-scrollable region). */
function DataTable({ ids, caption, headers, rows }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="adm-viz-table-block">
      <button type="button" className="btn btn-ghost btn-xs adm-viz-table-toggle" aria-expanded={open} aria-controls={ids.table}
        onClick={() => setOpen((o) => !o)}>
        {open ? t('admin.charts.hideTable') : t('admin.charts.showTable')}
      </button>
      <div id={ids.table} hidden={!open}>
        {open && (
          <div className="table-wrap adm-viz-table-wrap" role="region" aria-labelledby={ids.caption} tabIndex={0}>
            <table className="table adm-viz-table">
              <caption id={ids.caption} className="sr-only">{caption}</caption>
              <thead>
                <tr>{headers.map((h, i) => <th key={h} scope="col" className={i ? 'adm-num' : undefined}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row[0]}>
                    <th scope="row">{row[0]}</th>
                    {row.slice(1).map((cell, i) => <td key={i} className="adm-num">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartHead({ ids, title, summary }) {
  return (
    <figcaption className="adm-viz-head">
      <h3 id={ids.title} className="adm-viz-title">{title}</h3>
      {summary ? <p id={ids.summary} className="adm-viz-summary">{summary}</p> : null}
    </figcaption>
  );
}

/**
 * Columns on one value axis. `series` ([{ key, label, values, tone }]) are stacked bottom-up
 * with a 2px surface gap between segments; only the top segment has the rounded data end.
 * Bars are <= 24px wide, the whole band is the hover target, and only the tallest column's
 * total is printed (on its cap). A legend appears for two or more series; `totalLabel` adds
 * the stack total to the tooltip and the table.
 */
export function ColumnChart({
  id, title, summary, labels, formatLabel = (l) => l, formatLongLabel = (l) => l, series, totalLabel,
  formatValue, formatTick = formatValue, integer = false, height = 220, labelHeader, spreadTicks = false
}) {
  const t = useT();
  const ids = useChartIds(id);
  const [ref, width] = useChartWidth(640);
  const svgRef = useRef(null);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (Number(s.values[i]) || 0), 0));
  const rowsFor = (i) => [
    ...(totalLabel ? [{ key: '__total', label: totalLabel, value: formatValue(totals[i]) }] : []),
    ...series.map((s) => ({ key: s.key, tone: series.length > 1 || !totalLabel ? s.tone : null, label: s.label, value: formatValue(s.values[i]) }))
  ];
  const describe = (i) => `${formatLongLabel(labels[i])}: ${rowsFor(i).map((r) => `${r.label} ${r.value}`).join(', ')}`;
  const { active, setActive, announcement, handlers } = useReadout(n, describe);

  const scale = niceScale(Math.max(0, ...totals), { integer });
  const tickLabels = scale.ticks.map((v) => formatTick(v));
  const plot = { left: leftMargin(tickLabels), top: 22, width: 0, height: Math.max(20, height - 22 - 26) };
  plot.width = Math.max(20, width - plot.left - 8);
  const baseY = plot.top + plot.height;
  const layout = bandLayout(n, plot.left, plot.width);
  const xTicks = spreadTicks
    ? new Set(tickIndices(n, Math.max(2, Math.floor(plot.width / 64))))
    : new Set(labels.map((_, i) => i).filter((i) => i % Math.max(1, Math.ceil(30 / Math.max(1, layout.band))) === 0));
  const peaks = maxIndices(totals);
  const capLabels = new Set(peaks.length <= 3 ? peaks : []);

  const onPointerMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !n) return;
    setActive(bandIndex(e.clientX - rect.left, n, plot.left, plot.width));
  };

  return (
    <figure className="adm-viz">
      <ChartHead ids={ids} title={title} summary={summary} />
      {series.length > 1 && (
        <ul className="adm-viz-legend">
          {series.map((s) => (
            <li key={s.key}><span className={`adm-viz-key-box adm-viz-bg-${s.tone}`} aria-hidden="true" />{s.label}</li>
          ))}
        </ul>
      )}
      <div ref={ref} className="adm-viz-plot" tabIndex={0} role="img"
        aria-label={`${title}. ${t('admin.charts.keyboardHint')}`}
        aria-describedby={summary ? ids.summary : undefined}
        onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)} {...handlers}>
        <svg ref={svgRef} width={width} height={height} aria-hidden="true" focusable="false" className="adm-viz-svg">
          {active != null && (
            <rect className="adm-viz-band-hover" x={plot.left + layout.band * active} y={plot.top - 18} width={layout.band} height={plot.height + 18} />
          )}
          {scale.ticks.map((v, i) => {
            const y = valueY(v, scale.max, plot.top, plot.height);
            return (
              <g key={v}>
                <line className={v === 0 ? 'adm-viz-baseline' : 'adm-viz-gridline'} x1={plot.left} x2={plot.left + plot.width} y1={y} y2={y} />
                <text className="adm-viz-tick" x={plot.left - 8} y={y} dy="0.32em" textAnchor="end">{tickLabels[i]}</text>
              </g>
            );
          })}
          {labels.map((label, i) => {
            const x = layout.x(i);
            const stack = stackSegments(series.map((s) => s.values[i]), scale.max, plot.top, plot.height);
            return (
              <g key={label} className={active === i ? 'is-active' : undefined}>
                {stack.segments.map((seg, k) => (seg.value > 0 ? (
                  <path key={series[k].key} className={`adm-viz-bar adm-viz-fill-${series[k].tone}`}
                    d={seg.rounded ? columnPath(x, seg.top, layout.bar, seg.bottom) : rectPath(x, seg.top, layout.bar, seg.bottom)} />
                ) : null))}
                {stack.gaps.map((y) => <line key={y} className="adm-viz-seg-gap" x1={x} x2={x + layout.bar} y1={y} y2={y} />)}
                {capLabels.has(i) && (
                  <text className="adm-viz-cap-label" x={layout.center(i)} y={stack.top - 6} textAnchor="middle">{formatTick(totals[i])}</text>
                )}
                {xTicks.has(i) && (
                  <text className="adm-viz-tick" x={layout.center(i)} y={baseY + 17}
                    textAnchor={spreadTicks && n > 1 && i === 0 ? 'start' : spreadTicks && n > 1 && i === n - 1 ? 'end' : 'middle'}>
                    {formatLabel(label)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active != null && (
          <Tooltip x={layout.center(active)} top={plot.top} width={width} heading={formatLongLabel(labels[active])} rows={rowsFor(active)} />
        )}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <DataTable ids={ids} caption={title}
        headers={[labelHeader, ...(totalLabel ? [totalLabel] : []), ...series.map((s) => s.label)]}
        rows={labels.map((label, i) => [
          formatLongLabel(label), ...(totalLabel ? [formatValue(totals[i])] : []), ...series.map((s) => formatValue(s.values[i]))
        ])} />
    </figure>
  );
}

/**
 * Horizontal bars for a handful of named categories (e.g. bookings by status). Every value
 * and share is printed next to its bar, so the list itself is the accessible text version.
 */
export function HBarList({ title, summary, items, formatValue, tone = 1, emptyText }) {
  const ids = useChartIds();
  const max = Math.max(0, ...items.map((d) => d.value));
  return (
    <figure className="adm-viz">
      <ChartHead ids={ids} title={title} summary={summary} />
      {items.length === 0 ? (
        <p className="adm-viz-empty">{emptyText}</p>
      ) : (
        <ul className="adm-hbar-list">
          {items.map((d) => (
            <li key={d.key} className="adm-hbar-row">
              <span className="adm-hbar-label">{d.label}</span>
              <span className="adm-hbar-track" aria-hidden="true">
                <span className={`adm-hbar-fill adm-viz-bg-${tone}`} style={{ width: `${max ? (d.value / max) * 100 : 0}%` }} />
              </span>
              <span className="adm-hbar-value">
                {formatValue(d.value)}
                {d.share != null ? <span className="adm-hbar-share"> ({d.share}%)</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
