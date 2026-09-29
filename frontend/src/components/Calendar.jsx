import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { addDaysISO, addMonthsISO, parseISODate, toLocalISODate, todayISO } from '../utils/format';

const clamp = (iso, min, max) => {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
};

/**
 * Month calendar (FR-20). Dates are local 'yyyy-mm-dd' strings.
 * Keyboard (WAI-ARIA grid pattern): arrows move by day/week, Home/End to week start/end,
 * PageUp/PageDown by month (Shift: year), Enter/Space select. Disabled days stay focusable
 * (aria-disabled) so keyboard users can move past them.
 */
export default function Calendar({ value, onChange, minDate, maxDate, isDisabled, weekStartsOn = 1, label }) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const today = todayISO();
  const [focusDate, setFocusDate] = useState(() => clamp(parseISODate(value) ? value : today, minDate, maxDate));
  const gridRef = useRef(null);
  const focusPending = useRef(false);

  // Follow the selected value when it is changed from outside (e.g. a quick-pick strip).
  useEffect(() => {
    if (parseISODate(value)) setFocusDate(value);
  }, [value]);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate]);

  const view = parseISODate(focusDate) || new Date();
  const year = view.getFullYear();
  const month = view.getMonth();

  const fmt = useMemo(() => ({
    title: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    full: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    short: new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    long: new Intl.DateTimeFormat(locale, { weekday: 'long' })
  }), [locale]);

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + ((weekStartsOn + i) % 7)); // 7 Jan 2024 was a Sunday
    return { short: fmt.short.format(d), long: fmt.long.format(d) };
  }), [fmt, weekStartsOn]);

  const weeks = useMemo(() => {
    const lead = (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7;
    const cells = Array(lead).fill(null);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) cells.push(toLocalISODate(new Date(year, month, d)));
    while (cells.length % 7) cells.push(null);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month, weekStartsOn]);

  const isOff = (iso) => Boolean((minDate && iso < minDate) || (maxDate && iso > maxDate) || (isDisabled && isDisabled(iso)));

  const firstOfMonth = toLocalISODate(new Date(year, month, 1));
  const lastOfMonth = toLocalISODate(new Date(year, month + 1, 0));
  const prevDisabled = Boolean(minDate && addDaysISO(firstOfMonth, -1) < minDate);
  const nextDisabled = Boolean(maxDate && addDaysISO(lastOfMonth, 1) > maxDate);

  const moveFocus = (iso) => {
    const next = clamp(iso, minDate, maxDate);
    if (next === focusDate) return;
    focusPending.current = true;
    setFocusDate(next);
  };

  const onKeyDown = (e) => {
    const offsetInWeek = (parseISODate(focusDate).getDay() - weekStartsOn + 7) % 7;
    const moves = {
      ArrowLeft: () => addDaysISO(focusDate, -1),
      ArrowRight: () => addDaysISO(focusDate, 1),
      ArrowUp: () => addDaysISO(focusDate, -7),
      ArrowDown: () => addDaysISO(focusDate, 7),
      Home: () => addDaysISO(focusDate, -offsetInWeek),
      End: () => addDaysISO(focusDate, 6 - offsetInWeek),
      PageUp: () => addMonthsISO(focusDate, e.shiftKey ? -12 : -1),
      PageDown: () => addMonthsISO(focusDate, e.shiftKey ? 12 : 1)
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    moveFocus(moves[e.key]());
  };

  const goMonth = (delta) => setFocusDate((cur) => clamp(addMonthsISO(cur, delta), minDate, maxDate));

  const select = (iso) => {
    if (isOff(iso)) return;
    setFocusDate(iso);
    if (onChange) onChange(iso);
  };

  return (
    <div className="calendar" role="group" aria-label={label || t('calendar.label')}>
      <div className="calendar-head">
        <button type="button" className="calendar-nav" onClick={() => goMonth(-1)} disabled={prevDisabled}
          aria-label={t('calendar.prevMonth')}>
          <span aria-hidden="true">&#8249;</span>
        </button>
        <div id={titleId} className="calendar-title" aria-live="polite">{fmt.title.format(view)}</div>
        <button type="button" className="calendar-nav" onClick={() => goMonth(1)} disabled={nextDisabled}
          aria-label={t('calendar.nextMonth')}>
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>

      <table ref={gridRef} className="calendar-grid" role="grid" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {weekdays.map((w) => <th key={w.long} scope="col" abbr={w.long}>{w.short}</th>)}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((iso, di) => {
                if (!iso) return <td key={`blank-${wi}-${di}`} role="gridcell" />;
                const selected = iso === value;
                const off = isOff(iso);
                const isToday = iso === today;
                return (
                  <td key={iso} role="gridcell" aria-selected={selected}>
                    <button type="button" data-date={iso} tabIndex={iso === focusDate ? 0 : -1}
                      className={`calendar-day${selected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                      aria-disabled={off || undefined} aria-current={isToday ? 'date' : undefined}
                      aria-label={fmt.full.format(parseISODate(iso))}
                      onFocus={() => { if (iso !== focusDate) setFocusDate(iso); }}
                      onClick={() => select(iso)}>
                      {Number(iso.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
