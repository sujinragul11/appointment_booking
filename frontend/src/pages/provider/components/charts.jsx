import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n';
import { columnPath, labelStride, niceTicks } from '../lib/chart';

/*
 * Inline-SVG charts following the dataviz method: thin columns (<= 24px) with a 4px rounded
 * data-end, hairline grid, one axis, a legend only for 2+ series, selective direct labels,
 * a hover/focus tooltip (never the only way to a value) and a table view in every card.
 * Colours come from CSS tokens (--viz-s1, --viz-s2) validated for light and dark.
 */

function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Chart container: caption, optional legend, the chart and its table-view twin. */
export function ChartCard({ title, lead, legend, table, children, stale = false }) {
  const t = useT();
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const tableId = useId();
  return (
    <figure className={`viz card ${stale ? 'viz-stale' : ''}`} aria-labelledby={titleId} aria-busy={stale || undefined}>
      <div className="viz-head">
        <figcaption>
          <h3 className="viz-title" id={titleId}>{title}</h3>
          {lead ? <p className="viz-lead">{lead}</p> : null}
        </figcaption>
        {table ? (
          <button type="button" className="btn btn-ghost btn-xs viz-toggle" aria-expanded={showTable} aria-controls={tableId}
            onClick={() => setShowTable((s) => !s)}>
            {showTable ? t('provider.charts.hideTable') : t('provider.charts.showTable')}
            <span className="sr-only">: {title}</span>
          </button>
        ) : null}
      </div>
      {legend ? <ul className="viz-legend">{legend.map((l) => (
        <li key={l.key}><span className="viz-swatch" style={{ background: l.color }} aria-hidden="true" />{l.label}</li>
      ))}</ul> : null}
      {children}
      {table ? <div id={tableId} className="viz-table table-wrap" hidden={!showTable}>{table}</div> : null}
    </figure>
  );
}

/**
 * Vertical columns, optionally stacked. data: [{ key, label, tick, values: { [seriesKey]: n } }],
 * series: [{ key, label, color }]. Pointer or arrow keys move the readout between columns.
 * `highlight` = key of the column whose total gets a direct label (e.g. the peak).
 */
export function ColumnChart({ data, series, ariaLabel, height = 200, highlight, formatValue = (v) => String(v), describe }) {
  const t = useT();
  const [wrapRef, width] = useWidth();
  const [active, setActive] = useState(-1);
  const hintId = useId();
  const liveId = useId();
  const n = data.length;

  const totals = data.map((d) => series.reduce((sum, s) => sum + (Number(d.values[s.key]) || 0), 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1] || 1;
  const tickWidth = Math.max(...ticks.map((v) => formatValue(v).length)) * 7 + 10;
  const m = { top: 18, right: 8, bottom: 26, left: Math.max(28, tickWidth) };
  const plotW = Math.max(40, width - m.left - m.right);
  const band = n ? plotW / n : plotW;
  const gap = band >= 6 ? 2 : band >= 3 ? 1 : 0; // surface gap between touching bars
  const barW = Math.max(1, Math.min(24, band - gap, band * 0.72));
  const y = (v) => m.top + height - (v / top) * height;
  const stride = labelStride(n, band, 46);

  useEffect(() => {
    if (active >= n) setActive(-1);
  }, [active, n]);

  const onKey = (e) => {
    if (!n) return;
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 };
    if (e.key in moves) {
      e.preventDefault();
      setActive((i) => (i < 0 ? 0 : Math.min(n - 1, Math.max(0, i + moves[e.key]))));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(n - 1);
    } else if (e.key === 'Escape') {
      setActive(-1);
    }
  };

  const onPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - m.left;
    const i = Math.floor(x / band);
    setActive(i >= 0 && i < n ? i : -1);
  };

  const readout = active >= 0 && data[active]
    ? (describe ? describe(data[active]) : `${data[active].label}: ${series.map((s) => `${s.label} ${formatValue(data[active].values[s.key] || 0)}`).join(', ')}`)
    : '';

  const tipLeft = active >= 0 ? Math.min(Math.max(m.left + band * active + band / 2, 70), width - 70) : 0;
  const tipTop = active >= 0 ? Math.max(0, y(totals[active]) - 8) : 0;

  return (
    <div className="viz-plot" ref={wrapRef}>
      <div className="viz-focus" tabIndex={n ? 0 : -1} role="group" aria-label={ariaLabel} aria-describedby={hintId}
        onKeyDown={onKey} onBlur={() => setActive(-1)}>
        <svg width={width} height={m.top + height + m.bottom} className="viz-svg" aria-hidden="true" focusable="false"
          onPointerMove={onPointer} onPointerLeave={() => setActive(-1)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'viz-baseline' : 'viz-grid'} />
              <text x={m.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="viz-tick">{formatValue(v)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = m.left + band * i + band / 2;
            const x = cx - barW / 2;
            let base = 0;
            const segments = series.map((s, si) => {
              const v = Number(d.values[s.key]) || 0;
              if (v <= 0) return null;
              const y0 = y(base);
              const y1 = y(base + v);
              base += v;
              const isTop = series.slice(si + 1).every((s2) => !(Number(d.values[s2.key]) > 0));
              const bottomGap = y0 < m.top + height ? gap : 0; // gap above the segment below
              const h = Math.max(0.5, y0 - y1 - bottomGap);
              return isTop
                ? <path key={s.key} d={columnPath(x, y1, barW, h, 4)} style={{ fill: s.color }} />
                : <rect key={s.key} x={x} y={y1} width={barW} height={h} style={{ fill: s.color }} />;
            });
            return (
              <g key={d.key} className={i === active ? 'viz-col is-active' : 'viz-col'}>
                {i === active && <rect className="viz-hover" x={m.left + band * i} y={m.top} width={band} height={height} />}
                {segments}
                {i % stride === 0 && (
                  <text x={cx} y={m.top + height + 16} textAnchor="middle" className="viz-tick">{d.tick}</text>
                )}
                {highlight === d.key && totals[i] > 0 && (
                  <text x={cx} y={y(totals[i]) - 6} textAnchor="middle" className="viz-direct">{formatValue(totals[i])}</text>
                )}
              </g>
            );
          })}
        </svg>
        {active >= 0 && data[active] && (
          <div className="viz-tip" style={{ left: tipLeft, top: tipTop }} aria-hidden="true">
            <div className="viz-tip-title">{data[active].label}</div>
            {series.map((s) => (
              <div key={s.key} className="viz-tip-row">
                <span className="viz-key" style={{ background: s.color }} />
                <strong>{formatValue(data[active].values[s.key] || 0)}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p id={hintId} className="sr-only">{t('provider.charts.keyboardHint')}</p>
      <p id={liveId} className="sr-only" aria-live="polite">{readout}</p>
    </div>
  );
}

/** Horizontal bar list for nominal categories: one hue, value at the bar tip. */
export function BarList({ rows, formatValue = (v) => String(v), ariaLabel }) {
  const max = Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  return (
    <ul className="viz-bars" aria-label={ariaLabel}>
      {rows.map((r) => {
        const v = Number(r.value) || 0;
        const pct = max > 0 ? Math.max(v > 0 ? 1.5 : 0, (v / max) * 100) : 0;
        return (
          <li key={r.key} className="viz-bar-row">
            <span className="viz-bar-label">
              {r.label}
              {r.sub ? <span className="viz-bar-sub">{r.sub}</span> : null}
            </span>
            <span className="viz-bar-track">
              {/* the bar scales within the track minus room for the value at its tip */}
              <span className="viz-bar" style={{ width: `calc((100% - 4.5em) * ${pct / 100})` }} aria-hidden="true" />
              <span className="viz-bar-value">{formatValue(v)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
