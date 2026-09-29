import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { getErrorMessage } from '../../../api/client';
import Modal from '../../../components/Modal';
import Calendar from '../../../components/Calendar';
import SlotPicker from '../../../components/SlotPicker';
import { InlineLoader } from '../../../components/Loader';
import { useI18n } from '../../../i18n';
import { isValidTimeZone, parseISODate, timeZoneLabel } from '../../../utils/format';
import {
  bookingWindow, closedDayChecker, firstOpenDate, formatClock, formatDay, formatWhen, hhmm
} from '../../../utils/bookingCalendar';

const REASON_MAX = 500;

/**
 * Reschedule (FR-28): pick a new date and time for the same service and team member, then
 * PATCH /appointments/{id} { date, startTime, reason }. The provider's policy (maximum number
 * of reschedules, cut-off) is shown to customers; the server enforces it.
 */
export default function RescheduleDialog({ appt, isCustomer, onDone, onClose }) {
  const { t, locale } = useI18n();
  const [provider, setProvider] = useState(null);
  const [bundle, setBundle] = useState(undefined);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState({ key: '', list: null, message: '', error: '' });
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    let active = true;
    api.get(`/providers/${appt.providerId}`).then((r) => { if (active) setProvider(r.data); }).catch(() => { if (active) setProvider({}); });
    api.get(`/providers/${appt.providerId}/availability`).then((r) => { if (active) setBundle(r.data); }).catch(() => { if (active) setBundle(null); });
    return () => { active = false; };
  }, [appt.providerId]);

  const tz = isValidTimeZone(appt.timezone) ? appt.timezone : isValidTimeZone(provider?.timezone) ? provider.timezone : null;
  const service = (provider?.services || []).find((s) => String(s.id) === String(appt.serviceId));
  const policy = provider?.policy;
  const { today, maxDate } = bookingWindow(tz, service?.maxAdvanceBookingDays || policy?.maxAdvanceBookingDays);
  const staffIds = useMemo(() => (appt.staffId ? [appt.staffId] : (service?.staffIds || [])), [appt.staffId, service]);
  const isClosed = useMemo(() => closedDayChecker(bundle, staffIds), [bundle, staffIds]);
  const isOff = useCallback((iso) => iso < today || iso > maxDate || isClosed(iso), [today, maxDate, isClosed]);

  // Start on the appointment's own date when it can still be chosen, else the first open day.
  useEffect(() => {
    if (date || provider === null || bundle === undefined) return;
    setDate(!isOff(appt.date) ? appt.date : firstOpenDate(today, maxDate, isOff));
  }, [provider, bundle, date, isOff, appt.date, today, maxDate]);

  const loadSlots = useCallback(async () => {
    if (!date) return;
    const id = ++request.current;
    setSlots({ key: date, list: null, message: '', error: '' });
    setSlot(null);
    try {
      const params = { providerId: appt.providerId, serviceId: appt.serviceId, date };
      if (appt.staffId) params.staffId = appt.staffId; // keep the same team member
      const { data } = await api.get('/slots', { params });
      if (id !== request.current) return;
      setSlots({ key: date, list: Array.isArray(data?.slots) ? data.slots : [], message: data?.message || '', error: '' });
    } catch (e) {
      if (id === request.current) setSlots({ key: date, list: [], message: '', error: getErrorMessage(e, t('site.slots.loadFailed')) });
    }
  }, [appt.providerId, appt.serviceId, appt.staffId, date, t]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const submit = async () => {
    if (!slot || !date) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch(`/appointments/${appt.id}`, { date, startTime: slot.startTime, reason: reason.trim() || null });
      onDone(data);
    } catch (e) {
      setError(getErrorMessage(e, t('site.reschedule.failed')));
      if (e?.response?.status === 409) loadSlots();
    } finally {
      setBusy(false);
    }
  };

  const zone = tz ? timeZoneLabel(tz, parseISODate(date || today) || new Date()) : '';
  const loading = provider === null || bundle === undefined;
  // The appointment's current time shows as booked (by itself); mark it so it is recognisable.
  const list = slots.key === date && slots.list
    ? slots.list.map((s) => (date === appt.date && hhmm(s.startTime) === hhmm(appt.startTime)
      ? { ...s, status: 'CURRENT' } : s))
    : null;

  return (
    <Modal title={t('site.reschedule.title')} onClose={onClose} closeDisabled={busy} wide>
      <p className="hint">{t('site.reschedule.current', { when: formatWhen(appt, locale) })}</p>
      {appt.staffName && <p className="hint">{t('site.reschedule.withStaff', { name: appt.staffName })}</p>}
      {isCustomer && policy && (
        <p className="form-note mt-1">
          {policy.maxReschedules > 0
            ? t('site.reschedule.limit', { used: appt.rescheduleCount || 0, max: policy.maxReschedules, hours: policy.rescheduleCutoffHours })
            : t('site.reschedule.notAllowed')}
        </p>
      )}

      {loading ? (
        <p className="muted-line mt-2"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
      ) : (
        <div className="picker-grid with-calendar mt-2">
          <Calendar value={date || ''} onChange={(iso) => { setDate(iso); setError(''); }} minDate={today} maxDate={maxDate}
            isDisabled={isClosed} label={t('site.reschedule.dateLabel')} />
          <div className="slot-panel">
            <h3 className="slot-day">{date ? formatDay(date, locale, { weekday: 'long' }) : t('site.booking.noDates')}</h3>
            {tz && <p className="tz-note">{t('site.slots.shownIn', { zone, tz })}</p>}
            {date && (
              <SlotPicker slots={list} timezone={tz} message={slots.message} error={slots.error} onRetry={loadSlots}
                selectedTime={slot?.startTime} onSelect={(s) => { setSlot(s); setError(''); }}
                groupLabel={t('site.slots.groupFor', { date: formatDay(date, locale) })} />
            )}
          </div>
        </div>
      )}

      <div className="field mt-3">
        <label htmlFor="reschedule-reason">{t('site.reschedule.reason')} <span className="optional">({t('common.optional')})</span></label>
        <textarea id="reschedule-reason" rows={2} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      <p className="sr-only" aria-live="polite">
        {slot ? t('site.reschedule.selected', { when: `${formatDay(date, locale)}, ${formatClock(slot.startTime, locale)}` }) : ''}
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={!slot || busy} onClick={submit}>
          {busy ? <InlineLoader label={t('site.reschedule.saving')} />
            : slot ? t('site.reschedule.submitAt', { time: `${formatDay(date, locale)}, ${formatClock(slot.startTime, locale)}` })
              : t('site.reschedule.submit')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
      </div>
    </Modal>
  );
}
