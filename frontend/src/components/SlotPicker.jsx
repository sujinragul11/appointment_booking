import { useI18n } from '../i18n';
import { InlineLoader } from './Loader';
import { formatClock, hhmm, viewerClock } from '../utils/bookingCalendar';
import { tp } from '../utils/plural';

const OPEN = 'AVAILABLE';

/**
 * Time slots of one day (FR-20) as toggle buttons. AVAILABLE slots can be chosen; BOOKED,
 * HELD and BLOCKED ones stay visible but disabled, and say why. Times are the provider's
 * wall-clock times; when the viewer's clock differs, their own time is shown too.
 *
 * slots: null while loading, then [{ startTime, endTime, startAt, status, remaining }].
 */
export default function SlotPicker({
  slots, timezone, selectedTime, pendingTime, onSelect, error, onRetry, message, disabled = false, groupLabel
}) {
  const { t, locale } = useI18n();

  if (slots === null || slots === undefined) {
    return (
      <p className="muted-line" role="status"><InlineLoader label={t('site.slots.loading')} /> {t('site.slots.loading')}</p>
    );
  }

  if (error) {
    return (
      <div className="form-error" role="alert">
        {error}{' '}
        {onRetry && <button type="button" className="btn btn-outline btn-xs" onClick={onRetry}>{t('common.retry')}</button>}
      </div>
    );
  }

  const open = slots.filter((s) => s.status === OPEN || !s.status);
  const statusText = open.length === 0
    ? (message || t('site.slots.none'))
    : tp(t, 'site.slots.count', { count: open.length });

  if (slots.length === 0) {
    return <p className="muted-line slot-empty" role="status">{message || t('site.slots.none')}</p>;
  }

  return (
    <>
      <p className="sr-only" role="status">{statusText}</p>
      {open.length === 0 && <p className="muted-line slot-empty">{message || t('site.slots.none')}</p>}
      <div className="slot-grid" role="group" aria-label={groupLabel || t('site.slots.group')}>
        {slots.map((s) => {
          const available = s.status === OPEN || !s.status;
          const selected = available && hhmm(s.startTime) === hhmm(selectedTime);
          const pending = hhmm(s.startTime) === hhmm(pendingTime);
          const start = formatClock(s.startTime, locale);
          const end = formatClock(s.endTime, locale);
          const local = viewerClock(s.startAt, timezone, locale);
          const meta = !available
            ? t(`site.slots.status.${s.status}`)
            : s.remaining > 1 ? tp(t, 'site.slots.remaining', { count: s.remaining }) : '';
          const label = [
            end ? t('site.slots.range', { start, end }) : start,
            meta,
            local ? t('site.slots.yourTime', { time: local }) : ''
          ].filter(Boolean).join(', ');
          return (
            <button key={`${s.date || ''}-${s.startTime}`} type="button"
              className={`slot-btn ${selected ? 'selected' : ''} ${available ? '' : `slot-${String(s.status).toLowerCase()}`}`}
              aria-pressed={available ? selected : undefined} aria-label={label}
              disabled={!available || disabled || Boolean(pendingTime)} onClick={() => onSelect && onSelect(s)}>
              <span className="slot-start">{pending ? <InlineLoader label={t('site.slots.holding')} /> : start}</span>
              {end && <span className="slot-end">{t('site.slots.until', { time: end })}</span>}
              {meta && <span className={`slot-meta ${available ? 'slot-left' : ''}`}>{meta}</span>}
              {local && <span className="slot-local">{local}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
