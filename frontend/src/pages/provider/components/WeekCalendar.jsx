import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n';
import { useStatusLabel } from '../../../components/StatusBadge';
import StatusBadge from '../../../components/StatusBadge';
import { APPOINTMENT_STATUSES, groupByDate, layoutDay } from '../lib/schedule';
import { fmtDate, fmtHour, fmtTime, weekDates } from '../lib/time';

export const HOUR_PX = 64;

/** Matches a CSS media query; false where matchMedia is unavailable (tests, old browsers). */
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

function apptLabel(a, statusLabel, locale) {
  return [
    `${fmtTime(a.startTime, locale)} – ${fmtTime(a.endTime, locale)}`,
    a.customerName,
    a.serviceName,
    a.staffName,
    statusLabel(a.status)
  ].filter(Boolean).join(', ');
}

/**
 * Week schedule (FR-30): 7 day columns, time rows from the provider's hours, appointments as
 * blocks coloured by status (with the status in text too). Each block links to the shared
 * appointment page. On phones the grid collapses to a day-by-day agenda list.
 */
export default function WeekCalendar({ monday, appointments, hours, today, nowMinutes }) {
  const { t, locale } = useI18n();
  const statusLabel = useStatusLabel();
  const compact = useMediaQuery('(max-width: 640px)');
  const days = weekDates(monday);
  const byDate = groupByDate(appointments);
  const { startHour, endHour } = hours;
  const hourList = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = (endHour - startHour) * HOUR_PX;
  const pxPerMin = HOUR_PX / 60;

  if (compact) {
    return (
      <div className="wk-agenda">
        {days.map((d) => {
          const list = byDate[d] || [];
          return (
            <div key={d} className={`wk-agenda-day ${d === today ? 'is-today' : ''}`}>
              <h3 className="wk-agenda-title">
                {fmtDate(d, locale, { weekday: 'long', day: 'numeric', month: 'short' })}
                {d === today && <span className="wk-today-tag"> · {t('provider.schedule.today')}</span>}
              </h3>
              {list.length === 0 ? (
                <p className="pp-muted wk-agenda-empty">{t('provider.schedule.noAppointmentsDay')}</p>
              ) : (
                <ul className="wk-agenda-list">
                  {list.map((a) => (
                    <li key={a.id}>
                      <Link to={`/appointments/${a.id}`} className={`wk-agenda-item tone-${a.status}`}>
                        <span className="wk-agenda-time">{fmtTime(a.startTime, locale)} – {fmtTime(a.endTime, locale)}</span>
                        <span className="wk-agenda-main">
                          <strong>{a.customerName}</strong>
                          <span className="wk-agenda-sub">{a.serviceName}{a.staffName ? ` · ${a.staffName}` : ''}</span>
                        </span>
                        <StatusBadge status={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="wk-scroll">
      <div className="wk" style={{ '--wk-hour': `${HOUR_PX}px` }}>
        <div className="wk-head" aria-hidden="true">
          <div className="wk-corner" />
          {days.map((d) => (
            <div key={d} className={`wk-dayhead ${d === today ? 'is-today' : ''}`}>
              <span className="wk-dow">{fmtDate(d, locale, { weekday: 'short' })}</span>
              <span className="wk-dnum">{fmtDate(d, locale, { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </div>
        <div className="wk-body">
          <div className="wk-times" aria-hidden="true" style={{ height }}>
            {hourList.map((h) => (
              <span key={h} className="wk-time" style={{ top: (h - startHour) * HOUR_PX }}>{fmtHour(h, locale)}</span>
            ))}
          </div>
          {days.map((d) => {
            const laid = layoutDay(byDate[d] || [], { startHour, endHour, minMinutes: 24 });
            const dayName = fmtDate(d, locale, { weekday: 'long', day: 'numeric', month: 'long' });
            const showNow = d === today && Number.isFinite(nowMinutes) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;
            return (
              <div key={d} role="group" className={`wk-col ${d === today ? 'is-today' : ''}`} style={{ height }}
                aria-label={`${dayName}${d === today ? ` (${t('provider.schedule.today')})` : ''}: ${t('provider.schedule.countOnDay', { count: laid.length })}`}>
                {showNow && <div className="wk-now" style={{ top: (nowMinutes - startHour * 60) * pxPerMin }} aria-hidden="true" />}
                {laid.length > 0 && (
                  <ul className="wk-list">
                    {laid.map(({ item: a, start, end, lane, lanes }) => (
                      <li key={a.id} className="wk-item" style={{
                        top: (start - startHour * 60) * pxPerMin,
                        height: Math.max(18, (end - start) * pxPerMin - 2),
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`
                      }}>
                        <Link to={`/appointments/${a.id}`} className={`wk-appt tone-${a.status}`} aria-label={apptLabel(a, statusLabel, locale)}
                          title={apptLabel(a, statusLabel, locale)}>
                          <span className="wk-appt-line">
                            <span className="wk-appt-time">{fmtTime(a.startTime, locale)}</span> <span className="wk-appt-name">{a.customerName}</span>
                          </span>
                          <span className="wk-appt-svc">{a.serviceName}{a.staffName ? ` · ${a.staffName}` : ''}</span>
                          <span className="wk-appt-status">{statusLabel(a.status)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Colour key for the week grid (status is also written inside every block). */
export function StatusLegend() {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  return (
    <ul className="wk-legend" aria-label={t('provider.schedule.legend')}>
      {APPOINTMENT_STATUSES.map((s) => (
        <li key={s}><span className={`wk-legend-swatch tone-${s}`} aria-hidden="true" />{statusLabel(s)}</li>
      ))}
    </ul>
  );
}
