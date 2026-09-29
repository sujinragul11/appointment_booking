import { useEffect, useRef } from 'react';
import { useI18n } from '../../../i18n';
import { WEEK_DAYS, suggestWindow, summarizeWindows } from '../lib/availability';
import { fmtTime, weekdayName } from '../lib/time';

/**
 * Weekly hours editor with any number of windows per day (FR-14). Pure UI: the parent owns the
 * week object, validation result (`errors`: { windowKey: code }) and saving.
 * `reference` (optional) is another week shown read-only under each day, e.g. business hours
 * next to a staff member's own hours.
 */
export default function WeekEditor({ idPrefix, week, onChange, errors = {}, showErrors = false, emptyText, reference, referenceLabel, disabled = false }) {
  const { t, locale } = useI18n();
  const pendingFocus = useRef(null);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = document.getElementById(pendingFocus.current);
    pendingFocus.current = null;
    el?.focus();
  });

  const update = (day, list) => onChange({ ...week, [day]: list });

  const addWindow = (day) => {
    const w = suggestWindow(week[day]);
    pendingFocus.current = `${idPrefix}-${w.key}-start`;
    update(day, [...(week[day] || []), w]);
  };

  const removeWindow = (day, key) => {
    pendingFocus.current = `${idPrefix}-add-${day}`;
    update(day, week[day].filter((w) => w.key !== key));
  };

  const setTime = (day, key, field, value) => {
    update(day, week[day].map((w) => (w.key === key ? { ...w, [field]: value } : w)));
  };

  const errorText = (code) => t(`provider.availability.errors.${code}`);
  const timeFmt = (v) => fmtTime(v, locale);

  return (
    <div className="wk-edit">
      {WEEK_DAYS.map((day) => {
        const list = week[day] || [];
        const dayName = weekdayName(day, locale);
        const ref = reference?.[day] || [];
        return (
          <fieldset className="wk-day" key={day} disabled={disabled}>
            <legend className="wk-day-name">{dayName}</legend>
            <div className="wk-day-body">
              {list.length === 0 && <p className="wk-day-empty">{emptyText}</p>}
              {list.length > 0 && (
                <ul className="wk-windows">
                  {list.map((w, i) => {
                    const code = showErrors ? errors[w.key] : null;
                    const errId = `${idPrefix}-${w.key}-err`;
                    const n = i + 1;
                    return (
                      <li key={w.key} className={`wk-window ${code ? 'has-error' : ''}`}>
                        <div className="wk-window-row">
                          <label className="wk-time-field" htmlFor={`${idPrefix}-${w.key}-start`}>
                            <span className="wk-time-label">{t('provider.availability.from')}</span>
                            <span className="sr-only"> {t('provider.availability.windowOf', { day: dayName, n })}</span>
                            <input id={`${idPrefix}-${w.key}-start`} type="time" step={300} value={w.start}
                              aria-invalid={code ? true : undefined} aria-describedby={code ? errId : undefined}
                              onChange={(e) => setTime(day, w.key, 'start', e.target.value)} />
                          </label>
                          <label className="wk-time-field" htmlFor={`${idPrefix}-${w.key}-end`}>
                            <span className="wk-time-label">{t('provider.availability.to')}</span>
                            <span className="sr-only"> {t('provider.availability.windowOf', { day: dayName, n })}</span>
                            <input id={`${idPrefix}-${w.key}-end`} type="time" step={300} value={w.end}
                              aria-invalid={code ? true : undefined} aria-describedby={code ? errId : undefined}
                              onChange={(e) => setTime(day, w.key, 'end', e.target.value)} />
                          </label>
                          <button type="button" className="btn btn-ghost btn-xs wk-remove" onClick={() => removeWindow(day, w.key)}>
                            <span aria-hidden="true">✕ </span>{t('provider.availability.remove')}
                            <span className="sr-only"> {t('provider.availability.windowOf', { day: dayName, n })}</span>
                          </button>
                        </div>
                        {code && <p className="hint error-text wk-error" id={errId}>{errorText(code)}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {reference && (
                <p className="wk-day-ref">
                  {referenceLabel}: {ref.length ? summarizeWindows(ref, timeFmt) : t('provider.availability.closed')}
                </p>
              )}
              <button type="button" id={`${idPrefix}-add-${day}`} className="btn btn-outline btn-xs wk-add" onClick={() => addWindow(day)}>
                <span aria-hidden="true">+ </span>{t('provider.availability.addWindow')}
                <span className="sr-only"> {dayName}</span>
              </button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
