import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import { holdSlot, releaseHold } from '../api/site';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Loader, { InlineLoader } from '../components/Loader';
import Calendar from '../components/Calendar';
import SlotPicker from '../components/SlotPicker';
import Countdown from '../components/Countdown';
import ModeBadge from '../components/ModeBadge';
import VerifyCode from '../components/VerifyCode';
import { usePayment } from '../components/PaymentDialog';
import useSiteConfig from '../hooks/useSiteConfig';
import { useI18n } from '../i18n';
import { addDaysISO, formatMoney, isValidTimeZone, parseISODate, timeZoneLabel } from '../utils/format';
import {
  bookingWindow, closedDayChecker, firstOpenDate, formatClock, formatDay, hhmm, viewerClock
} from '../utils/bookingCalendar';
import { localDeadline } from '../utils/countdown';
import { loginPath } from '../utils/routes';
import { tp } from '../utils/plural';

const isActive = (x) => x && x.active !== false;
const MODES = ['IN_PERSON', 'ONLINE'];
const NOTES_MAX = 1000;
const round2 = (n) => Math.round(n * 100) / 100;

/** Amounts shown in the summary; mirrors what POST /appointments will charge. */
export function priceSummary({ price = 0, discount = 0, method, option, depositPercent = 0 }) {
  const total = Math.max(0, round2(price - discount));
  const online = method === 'RAZORPAY' && total > 0;
  const payNow = !online ? 0 : option === 'DEPOSIT' ? round2(total * depositPercent / 100) : total;
  return { total, payNow, atVenue: round2(total - payNow) };
}

/**
 * Booking wizard (FR-20..26): service -> team member -> format -> date & time -> details -> confirm.
 * The URL carries the choices (/book/:providerId/:serviceId?staff=&mode=&date=&time=) so a guest who
 * must sign in first comes back to the same selection. Picking a time holds it for 10 minutes.
 */
export default function BookingWizard() {
  const { providerId, serviceId } = useParams();
  const [params, setParams] = useSearchParams();
  const { user, updateUser } = useAuth();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const config = useSiteConfig();

  const [provider, setProvider] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [bundle, setBundle] = useState(undefined);
  const [attempt, setAttempt] = useState(0);
  const [slotsState, setSlotsState] = useState({ key: '', slots: null, message: '', error: '' });
  const [slotNotice, setSlotNotice] = useState(null);
  const [hold, setHold] = useState(null);
  const [holding, setHolding] = useState(null);
  const [notes, setNotes] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [methodChoice, setMethodChoice] = useState(null);
  const [optionChoice, setOptionChoice] = useState('FULL');
  const [busy, setBusy] = useState(false);
  const [bookError, setBookError] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const slotRequest = useRef(0);
  const holdRef = useRef(null);
  const keyRef = useRef('');
  const bookedRef = useRef(false);
  const pendingTime = useRef(params.get('time'));
  const couponRef = useRef('');
  const slotsHeading = useRef(null);
  holdRef.current = hold;

  /* ---------- data ---------- */

  useEffect(() => {
    let active = true;
    setLoadError(null);
    api.get(`/providers/${providerId}`)
      .then((r) => { if (active) setProvider(r.data); })
      .catch((e) => { if (active) setLoadError({ status: e?.response?.status, message: getErrorMessage(e) }); });
    // Working hours only grey out closed days; the slot search is authoritative.
    api.get(`/providers/${providerId}/availability`)
      .then((r) => { if (active) setBundle(r.data); })
      .catch(() => { if (active) setBundle(null); });
    return () => { active = false; };
  }, [providerId, attempt]);

  const services = useMemo(() => (provider?.services || []).filter(isActive), [provider]);
  const svc = useMemo(() => services.find((s) => String(s.id) === String(serviceId)), [services, serviceId]);
  const staffOptions = useMemo(() => {
    const ids = (svc?.staffIds || []).map(String);
    return ids.length ? (provider?.staff || []).filter((s) => isActive(s) && ids.includes(String(s.id))) : [];
  }, [provider, svc]);

  const staffParam = params.get('staff') || '';
  const staffId = staffOptions.some((s) => String(s.id) === staffParam) ? staffParam : '';
  const modeParam = params.get('mode');
  const mode = svc?.mode === 'BOTH' ? (MODES.includes(modeParam) ? modeParam : 'IN_PERSON') : svc?.mode;
  const tz = isValidTimeZone(provider?.timezone) ? provider.timezone : null;
  const { today, maxDate } = bookingWindow(tz, svc?.maxAdvanceBookingDays);
  const staffIdsForDays = useMemo(
    () => (staffId ? [staffId] : (svc?.staffIds || []).filter((id) => staffOptions.some((s) => String(s.id) === String(id)))),
    [staffId, svc, staffOptions]
  );
  const isClosed = useMemo(() => closedDayChecker(bundle, staffIdsForDays), [bundle, staffIdsForDays]);
  const isDateOff = useCallback((iso) => iso < today || iso > maxDate || isClosed(iso), [today, maxDate, isClosed]);
  const dateParam = params.get('date');
  const date = parseISODate(dateParam) && !isDateOff(dateParam) ? dateParam : firstOpenDate(today, maxDate, isDateOff);
  const slotKey = `${svc?.id || ''}|${staffId}|${date || ''}`;
  keyRef.current = slotKey;

  // The service in the URL may be inactive or gone: fall back to the first bookable one.
  useEffect(() => {
    if (provider && !svc && services.length) {
      navigate({ pathname: `/book/${providerId}/${services[0].id}`, search: params.toString() }, { replace: true });
    }
  }, [provider, svc, services]); // eslint-disable-line react-hooks/exhaustive-deps

  const setQuery = useCallback((changes) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      });
      return next;
    }, { replace: true });
  }, [setParams]);

  const loadSlots = useCallback(async () => {
    const id = ++slotRequest.current;
    const key = `${svc?.id || ''}|${staffId}|${date || ''}`;
    setSlotsState({ key, slots: null, message: '', error: '' });
    if (!svc || !date) return;
    try {
      const { data } = await api.get('/slots', {
        params: { providerId, serviceId: svc.id, staffId: staffId || undefined, date }
      });
      if (id !== slotRequest.current) return;
      const slots = Array.isArray(data?.slots) ? data.slots : Array.isArray(data) ? data : [];
      setSlotsState({ key, slots, message: data?.message || '', error: '' });
    } catch (e) {
      if (id === slotRequest.current) setSlotsState({ key, slots: [], message: '', error: getErrorMessage(e, t('site.slots.loadFailed')) });
    }
  }, [providerId, svc, staffId, date, t]);

  useEffect(() => {
    if (provider && svc && bundle !== undefined) loadSlots();
  }, [provider, svc, bundle, loadSlots]);

  // A hold belongs to one service / team member / date: release it when any of them changes.
  useEffect(() => {
    const current = holdRef.current;
    if (current && current.key !== slotKey) {
      releaseHold(current.holdToken);
      setHold(null);
    }
  }, [slotKey]);

  // Leaving the page gives the held time back (unless it was just booked).
  useEffect(() => () => {
    const current = holdRef.current;
    if (current && !bookedRef.current) releaseHold(current.holdToken);
  }, []);

  /* ---------- choices ---------- */

  const changeSelection = (changes) => {
    pendingTime.current = null;
    setSlotNotice(null);
    setBookError('');
    setQuery({ ...changes, time: null });
  };

  const chooseService = (id) => {
    if (String(id) === String(serviceId)) return;
    pendingTime.current = null;
    setSlotNotice(null);
    setBookError('');
    setCoupon(null);
    setCouponError('');
    setOptionChoice('FULL');
    const next = new URLSearchParams(params);
    ['time', 'mode'].forEach((k) => next.delete(k));
    navigate({ pathname: `/book/${providerId}/${id}`, search: next.toString() }, { replace: true });
  };

  const selectSlot = useCallback(async (slot) => {
    if (!svc || !date) return;
    const time = hhmm(slot.startTime);
    if (!user) {
      const next = new URLSearchParams(params);
      next.set('date', date);
      next.set('time', time);
      const here = `/book/${providerId}/${svc.id}?${next.toString()}`;
      navigate(loginPath(here), { state: { from: here, notice: t('site.booking.signInToBook') } });
      return;
    }
    if (user.role !== 'CUSTOMER') {
      setSlotNotice({ type: 'error', text: t('site.booking.customersOnly') });
      return;
    }
    const key = keyRef.current;
    const previous = holdRef.current;
    if (previous && previous.key === key && hhmm(previous.startTime) === time) return;
    setHolding(slot.startTime);
    setSlotNotice(null);
    setBookError('');
    if (previous) {
      setHold(null);
      releaseHold(previous.holdToken);
    }
    try {
      const data = await holdSlot({
        providerId: Number(providerId), serviceId: svc.id, staffId: staffId ? Number(staffId) : null, date, startTime: slot.startTime
      });
      if (keyRef.current !== key) { // the selection changed while the request was in flight
        releaseHold(data.holdToken);
        return;
      }
      setHold({ ...data, key, startAt: slot.startAt, deadline: localDeadline(data.expiresAt, data.serverDate) });
      setQuery({ date, time });
      setAnnouncement(t('site.booking.heldAnnounce', { time: formatClock(slot.startTime, locale) }));
    } catch (e) {
      const status = e?.response?.status;
      if (status === 409) {
        setSlotNotice({ type: 'error', text: t('site.booking.slotTaken') });
        loadSlots();
      } else {
        setSlotNotice({ type: 'error', text: getErrorMessage(e, t('site.booking.holdFailed')) });
      }
    } finally {
      setHolding(null);
    }
  }, [svc, date, user, params, providerId, navigate, t, staffId, setQuery, locale, loadSlots]);

  // Coming back from sign-in with ?time=: pick that time again if it is still free.
  useEffect(() => {
    const wanted = pendingTime.current;
    if (!wanted || !user || slotsState.key !== slotKey || !Array.isArray(slotsState.slots)) return;
    pendingTime.current = null;
    if (user.role !== 'CUSTOMER') return;
    const slot = slotsState.slots.find((s) => hhmm(s.startTime) === hhmm(wanted));
    if (slot && (slot.status === 'AVAILABLE' || !slot.status)) selectSlot(slot);
    else setSlotNotice({ type: 'info', text: t('site.booking.restoreGone', { time: formatClock(wanted, locale) }) });
  }, [slotsState, slotKey, user, selectSlot, t, locale]);

  // The first open day may have no times left (e.g. late today): move on to the next open day,
  // but only while the customer has not picked a date themselves.
  const autoAdvanced = useRef(false);
  useEffect(() => {
    if (autoAdvanced.current || dateParam || pendingTime.current || !date) return;
    if (slotsState.key !== slotKey || !Array.isArray(slotsState.slots) || slotsState.error) return;
    autoAdvanced.current = true;
    if (slotsState.slots.some((s) => s.status === 'AVAILABLE' || !s.status)) return;
    const next = firstOpenDate(addDaysISO(date, 1), maxDate, isDateOff);
    if (next) setQuery({ date: next });
  }, [slotsState, slotKey, dateParam, date, maxDate, isDateOff, setQuery]);

  const onHoldExpired = useCallback(() => {
    if (!holdRef.current) return;
    setHold(null);
    setQuery({ time: null });
    setSlotNotice({ type: 'info', text: t('site.booking.holdExpired') });
    loadSlots();
  }, [setQuery, t, loadSlots]);

  /* ---------- details ---------- */

  const onCouponChange = (value) => {
    const code = value.toUpperCase().replace(/\s/g, '');
    couponRef.current = code;
    setCouponCode(code);
    setCoupon(null); // an applied discount belongs to the code it was validated for
    setCouponError('');
  };

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code || !svc) return;
    setCouponBusy(true);
    setCouponError('');
    try {
      const { data } = await api.get('/coupons/validate', { params: { code, amount: svc.price } });
      if (couponRef.current !== code) return; // edited while validating
      if (data?.valid === false) {
        setCoupon(null);
        setCouponError(data.message || t('site.booking.couponInvalid'));
      } else {
        setCoupon({ ...data, code: data?.code || code });
      }
    } catch (e) {
      if (couponRef.current !== code) return;
      setCoupon(null);
      setCouponError(getErrorMessage(e, t('site.booking.couponInvalid')));
    } finally {
      setCouponBusy(false);
    }
  };

  const onlineAvailable = config ? config.onlinePayments !== false : true;
  const method = mode === 'ONLINE' ? 'RAZORPAY' : !onlineAvailable ? 'PAY_AT_VENUE' : (methodChoice || 'PAY_AT_VENUE');
  const depositPercent = Number(svc?.depositPercent || 0);
  const depositAllowed = method === 'RAZORPAY' && depositPercent > 0 && depositPercent < 100;
  const option = depositAllowed ? optionChoice : 'FULL';
  const discount = coupon ? Number(coupon.discount) || 0 : 0;
  const amounts = priceSummary({ price: Number(svc?.price || 0), discount, method, option, depositPercent });
  const cannotPay = mode === 'ONLINE' && !onlineAvailable;

  /* ---------- booking ---------- */

  const payment = usePayment({
    onPaid: (id) => {
      toast(t('site.payment.success'), 'success');
      navigate(`/book/success/${id}`, { replace: true });
    },
    onDismiss: (id) => navigate(`/appointments/${id}`, { replace: true, state: { notice: t('site.payment.reservedNotice') } }),
    onError: (e, id) => navigate(`/appointments/${id}`, {
      replace: true, state: { notice: t('site.payment.startFailed', { reason: getErrorMessage(e, t('site.payment.failed')) }) }
    })
  });

  const confirm = async () => {
    const current = holdRef.current;
    if (!current || !svc || busy) return;
    setBusy(true);
    setBookError('');
    const payload = {
      providerId: Number(providerId),
      serviceId: svc.id,
      staffId: staffId ? Number(staffId) : null,
      date: current.date || date,
      startTime: current.startTime,
      notes: notes.trim() || null,
      couponCode: coupon ? coupon.code : null,
      paymentMethod: method,
      paymentOption: method === 'RAZORPAY' ? option : null,
      mode,
      holdToken: current.holdToken
    };
    let appointment;
    try {
      appointment = (await api.post('/appointments', payload)).data;
    } catch (e) {
      const status = e?.response?.status;
      const message = getErrorMessage(e, t('site.booking.failed'));
      if (status === 403 && /verif/i.test(message)) {
        setNeedsVerify(true);
      } else if (status === 409) {
        releaseHold(current.holdToken);
        setHold(null);
        setQuery({ time: null });
        setSlotNotice({ type: 'error', text: message || t('site.booking.slotTaken') });
        loadSlots();
        slotsHeading.current?.focus();
      } else {
        setBookError(message);
      }
      setBusy(false);
      return;
    }
    bookedRef.current = true;
    setHold(null);
    setBusy(false);
    const needsPayment = method === 'RAZORPAY' && (appointment.actions?.canPay
      || (appointment.payment?.status === 'PENDING' && appointment.paymentDueAt));
    if (needsPayment) {
      payment.start(appointment.id);
    } else {
      toast(t('site.booking.booked'), 'success');
      navigate(`/book/success/${appointment.id}`, { replace: true });
    }
  };

  // Retried after an inline e-mail verification; a ref so the callback always calls the latest version.
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  /* ---------- render ---------- */

  if (loadError) {
    return (
      <div className="container page">
        <div className="empty card card-pad">
          <h1 className="empty-title">{loadError.status === 404 ? t('site.provider.notFound') : t('site.provider.loadFailed')}</h1>
          <p className="mt-1">{loadError.status === 404 ? t('site.provider.notFoundText') : loadError.message}</p>
          <div className="btn-row center-row mt-3">
            {loadError.status !== 404 && <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</button>}
            <Link className="btn btn-outline" to="/providers">{t('site.nav.providers')}</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!provider) return <Loader label={t('common.loading')} />;

  if (services.length === 0) {
    return (
      <div className="container page narrow-page">
        <Link to={`/providers/${providerId}`} className="link-more back-link"><span aria-hidden="true">&larr;</span> {provider.businessName}</Link>
        <div className="empty card card-pad mt-2">
          <h1 className="empty-title">{t('site.booking.noServices')}</h1>
          <p className="mt-1">{t('site.booking.noServicesText', { name: provider.businessName })}</p>
        </div>
      </div>
    );
  }
  if (!svc) return <Loader label={t('common.loading')} />;

  const steps = ['service', staffOptions.length > 0 && 'staff', svc.mode === 'BOTH' && 'mode', 'when', 'details'].filter(Boolean);
  const stepNo = (id) => steps.indexOf(id) + 1;
  const selectedStaff = staffOptions.find((s) => String(s.id) === String(hold?.staffId ?? staffId));
  const heldSlot = hold ? (slotsState.slots || []).find((s) => hhmm(s.startTime) === hhmm(hold.startTime)) : null;
  const localHeld = hold ? viewerClock(hold.startAt || heldSlot?.startAt, tz, locale) : '';
  const zone = tz ? timeZoneLabel(tz, parseISODate(date || today) || new Date()) : '';
  const verified = Boolean(user?.verified || user?.emailVerified);
  const isCustomer = user?.role === 'CUSTOMER';
  const slotsReady = slotsState.key === slotKey;
  const confirmLabel = method === 'RAZORPAY' && amounts.payNow > 0
    ? t('site.booking.confirmPay', { amount: formatMoney(amounts.payNow) }) : t('site.booking.confirm');

  return (
    <div className="container page">
      <Link to={`/providers/${providerId}`} className="link-more back-link"><span aria-hidden="true">&larr;</span> {provider.businessName}</Link>
      <h1 className="page-title mt-1">{t('site.booking.title')}</h1>
      <p className="page-lead">
        {provider.businessName}
        {tz && <> · {t('site.provider.timesIn', { zone, tz })}</>}
      </p>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {user && !isCustomer && (
        <div className="form-note mt-2" role="note">{t('site.booking.customersOnly')}</div>
      )}

      <div className="booking-grid mt-3">
        <div className="booking-steps">
          <section className="card card-pad" aria-labelledby="step-service">
            <h2 id="step-service" className="step-title"><span className="step-num" aria-hidden="true">{stepNo('service')}</span> {t('site.booking.stepService')}</h2>
            <fieldset className="plain-fieldset">
              <legend className="sr-only">{t('site.booking.stepService')}</legend>
              {services.map((s) => {
                const checked = svc.id === s.id;
                return (
                  <label key={s.id} className={`list-item service-option ${checked ? 'selected' : ''}`}>
                    <input type="radio" name="booking-service" checked={checked} onChange={() => chooseService(s.id)} />
                    <span className="service-option-main">
                      <span className="service-option-name">{s.name}</span>
                      <span className="service-option-meta">
                        {t('site.services.duration', { min: s.durationMin })}
                        {s.depositPercent > 0 && s.depositPercent < 100 ? ` · ${t('site.services.deposit', { pct: s.depositPercent })}` : ''}
                      </span>
                    </span>
                    <ModeBadge mode={s.mode} />
                    <strong className="service-option-price">{formatMoney(s.price)}</strong>
                  </label>
                );
              })}
            </fieldset>
          </section>

          {staffOptions.length > 0 && (
            <section className="card card-pad" aria-labelledby="step-staff">
              <h2 id="step-staff" className="step-title"><span className="step-num" aria-hidden="true">{stepNo('staff')}</span> {t('site.booking.stepStaff')}</h2>
              <fieldset className="plain-fieldset chip-radios">
                <legend className="sr-only">{t('site.booking.stepStaff')}</legend>
                <label className={`chip ${staffId === '' ? 'active' : ''}`}>
                  <input type="radio" name="booking-staff" className="sr-only" checked={staffId === ''} onChange={() => changeSelection({ staff: null })} />
                  {t('site.booking.anyStaff')}
                </label>
                {staffOptions.map((s) => (
                  <label key={s.id} className={`chip ${String(staffId) === String(s.id) ? 'active' : ''}`}>
                    <input type="radio" name="booking-staff" className="sr-only" checked={String(staffId) === String(s.id)}
                      onChange={() => changeSelection({ staff: s.id })} />
                    {s.name}{s.designation ? <span className="chip-sub"> · {s.designation}</span> : null}
                  </label>
                ))}
              </fieldset>
            </section>
          )}

          {svc.mode === 'BOTH' && (
            <section className="card card-pad" aria-labelledby="step-mode">
              <h2 id="step-mode" className="step-title"><span className="step-num" aria-hidden="true">{stepNo('mode')}</span> {t('site.booking.stepMode')}</h2>
              <fieldset className="plain-fieldset chip-radios">
                <legend className="sr-only">{t('site.booking.stepMode')}</legend>
                {MODES.map((m) => (
                  <label key={m} className={`chip ${mode === m ? 'active' : ''}`}>
                    <input type="radio" name="booking-mode" className="sr-only" checked={mode === m}
                      onChange={() => { setQuery({ mode: m }); if (m === 'ONLINE') setMethodChoice('RAZORPAY'); }} />
                    {t(`site.mode.${m}`)}
                  </label>
                ))}
              </fieldset>
              <p className="hint mt-1">{mode === 'ONLINE' ? t('site.booking.onlineHint') : t('site.booking.inPersonHint')}</p>
            </section>
          )}

          <section className="card card-pad" aria-labelledby="step-when">
            <h2 id="step-when" className="step-title"><span className="step-num" aria-hidden="true">{stepNo('when')}</span> {t('site.booking.stepWhen')}</h2>
            {bundle && Array.isArray(bundle.availability) && bundle.availability.length === 0 && (
              <p className="form-note">{t('site.booking.noHours')}</p>
            )}
            <div className="picker-grid with-calendar">
              <div>
                <Calendar value={date || ''} onChange={(iso) => changeSelection({ date: iso })} minDate={today} maxDate={maxDate}
                  isDisabled={isClosed} label={t('site.booking.dateLabel')} />
                <p className="hint mt-1">{t('site.booking.window', { days: svc.maxAdvanceBookingDays || provider.policy?.maxAdvanceBookingDays || 30 })}</p>
              </div>
              <div className="slot-panel">
                <div className="slot-panel-head">
                  <h3 ref={slotsHeading} tabIndex={-1}>{date ? formatDay(date, locale, { weekday: 'long' }) : t('site.booking.noDates')}</h3>
                  {date && (
                    <button type="button" className="btn btn-outline btn-xs" onClick={loadSlots}>{t('site.slots.refresh')}</button>
                  )}
                </div>
                {tz && <p className="tz-note">{t('site.slots.shownIn', { zone, tz })}</p>}
                {slotNotice && (
                  <p className={slotNotice.type === 'error' ? 'form-error' : 'form-note'} role={slotNotice.type === 'error' ? 'alert' : 'status'}>
                    {slotNotice.text}
                  </p>
                )}
                {!date ? (
                  <p className="muted-line">{t('site.booking.noDatesText')}</p>
                ) : (
                  <SlotPicker slots={slotsReady ? slotsState.slots : null} timezone={tz} message={slotsState.message}
                    error={slotsReady ? slotsState.error : ''} onRetry={loadSlots}
                    selectedTime={hold && hold.key === slotKey ? hold.startTime : null} pendingTime={holding}
                    onSelect={selectSlot} disabled={Boolean(user && !isCustomer)}
                    groupLabel={t('site.slots.groupFor', { date: formatDay(date, locale) })} />
                )}
                {!user && <p className="hint mt-2">{t('site.booking.guestHint')}</p>}
              </div>
            </div>
          </section>

          <section className="card card-pad" aria-labelledby="step-details">
            <h2 id="step-details" className="step-title"><span className="step-num" aria-hidden="true">{stepNo('details')}</span> {t('site.booking.stepDetails')}</h2>
            <div className="field">
              <label htmlFor="booking-notes">{t('site.booking.notes')} <span className="optional">({t('common.optional')})</span></label>
              <textarea id="booking-notes" rows={3} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={t('site.booking.notesPlaceholder')} aria-describedby="booking-notes-count" />
              <span className="hint" id="booking-notes-count">{tp(t, 'site.common.charsLeft', { count: NOTES_MAX - notes.length })}</span>
            </div>

            <div className="field">
              <label htmlFor="coupon-code">{t('site.booking.coupon')}</label>
              <div className="inline-field">
                <input id="coupon-code" value={couponCode} onChange={(e) => onCouponChange(e.target.value)} placeholder={t('site.booking.couponPlaceholder')}
                  autoComplete="off" maxLength={40} aria-describedby="coupon-status" aria-invalid={Boolean(couponError) || undefined}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }} />
                <button type="button" className="btn btn-outline" onClick={applyCoupon} disabled={!couponCode.trim() || couponBusy}>
                  {couponBusy ? <InlineLoader label={t('site.booking.couponChecking')} /> : t('site.booking.couponApply')}
                </button>
              </div>
              <div id="coupon-status" aria-live="polite">
                {couponError && <span className="hint error-text">{couponError}</span>}
                {coupon && <span className="hint success-text">{t('site.booking.couponApplied', { code: coupon.code, amount: formatMoney(discount) })}</span>}
              </div>
            </div>

            <fieldset className="plain-fieldset field">
              <legend className="field-label">{t('site.booking.paymentMethod')}</legend>
              <label className={`pay-option ${method === 'RAZORPAY' ? 'selected' : ''}`}>
                <input type="radio" name="booking-method" value="RAZORPAY" checked={method === 'RAZORPAY'}
                  disabled={!onlineAvailable} onChange={() => setMethodChoice('RAZORPAY')} />
                <span>
                  <span className="pay-option-title">{t('site.booking.payOnline')}</span>
                  <span className="pay-option-sub">{config?.paymentsDemoMode ? t('site.booking.payOnlineDemo') : t('site.booking.payOnlineSub')}</span>
                </span>
              </label>
              <label className={`pay-option ${method === 'PAY_AT_VENUE' ? 'selected' : ''}`}>
                <input type="radio" name="booking-method" value="PAY_AT_VENUE" checked={method === 'PAY_AT_VENUE'}
                  disabled={mode === 'ONLINE'} onChange={() => setMethodChoice('PAY_AT_VENUE')}
                  aria-describedby={mode === 'ONLINE' ? 'venue-note' : undefined} />
                <span>
                  <span className="pay-option-title">{t('site.booking.payVenue')}</span>
                  <span className="pay-option-sub" id="venue-note">
                    {mode === 'ONLINE' ? t('site.booking.venueNotForOnline') : t('site.booking.payVenueSub')}
                  </span>
                </span>
              </label>
              {cannotPay && <p className="form-error mt-1" role="alert">{t('site.booking.onlineUnavailable')}</p>}
            </fieldset>

            {depositAllowed && (
              <fieldset className="plain-fieldset field">
                <legend className="field-label">{t('site.booking.paymentOption')}</legend>
                <label className={`pay-option ${option === 'FULL' ? 'selected' : ''}`}>
                  <input type="radio" name="booking-option" value="FULL" checked={option === 'FULL'} onChange={() => setOptionChoice('FULL')} />
                  <span>
                    <span className="pay-option-title">{t('site.booking.payFull')}</span>
                    <span className="pay-option-sub">{formatMoney(amounts.total)}</span>
                  </span>
                </label>
                <label className={`pay-option ${option === 'DEPOSIT' ? 'selected' : ''}`}>
                  <input type="radio" name="booking-option" value="DEPOSIT" checked={option === 'DEPOSIT'} onChange={() => setOptionChoice('DEPOSIT')} />
                  <span>
                    <span className="pay-option-title">{t('site.booking.payDeposit', { pct: depositPercent })}</span>
                    <span className="pay-option-sub">
                      {t('site.booking.depositSplit', {
                        now: formatMoney(priceSummary({ price: Number(svc.price), discount, method, option: 'DEPOSIT', depositPercent }).payNow),
                        later: formatMoney(priceSummary({ price: Number(svc.price), discount, method, option: 'DEPOSIT', depositPercent }).atVenue)
                      })}
                    </span>
                  </span>
                </label>
              </fieldset>
            )}
          </section>
        </div>

        <aside className="booking-summary" aria-labelledby="summary-title">
          <div className="card card-pad">
            <h2 id="summary-title" className="step-title">{t('site.booking.summary')}</h2>
            <dl className="summary-list">
              <div><dt>{t('site.booking.service')}</dt><dd>{svc.name}</dd></div>
              {staffOptions.length > 0 && (
                <div><dt>{t('site.booking.staff')}</dt><dd>{selectedStaff ? selectedStaff.name : t('site.booking.anyStaff')}</dd></div>
              )}
              <div><dt>{t('site.booking.format')}</dt><dd><ModeBadge mode={mode} /></dd></div>
              <div><dt>{t('site.booking.duration')}</dt><dd>{t('site.services.duration', { min: svc.durationMin })}</dd></div>
              <div>
                <dt>{t('site.booking.when')}</dt>
                <dd>
                  {hold ? (
                    <>
                      {formatDay(hold.date || date, locale)}, {formatClock(hold.startTime, locale)}
                      {hold.endTime ? ` – ${formatClock(hold.endTime, locale)}` : ''}{zone ? ` ${zone}` : ''}
                      {localHeld && <span className="tz-note block">{t('site.slots.yourTime', { time: localHeld })}</span>}
                    </>
                  ) : <span className="muted">{t('site.booking.pickTime')}</span>}
                </dd>
              </div>
            </dl>

            {hold?.deadline && (
              <p className="hold-banner">
                {t('site.booking.heldFor')}{' '}
                <Countdown deadline={hold.deadline} onExpire={onHoldExpired}
                  announce={(m) => tp(t, 'site.booking.holdMinutes', { count: m })} expiredText={t('site.booking.holdExpired')} />
              </p>
            )}

            <div className="divider-h" />
            <dl className="price-list">
              <div><dt>{t('site.booking.price')}</dt><dd>{formatMoney(svc.price)}</dd></div>
              {discount > 0 && <div><dt>{t('site.booking.discount', { code: coupon.code })}</dt><dd className="success-text">−{formatMoney(discount)}</dd></div>}
              <div className="price-total"><dt>{t('site.booking.total')}</dt><dd>{formatMoney(amounts.total)}</dd></div>
              {method === 'RAZORPAY' && amounts.total > 0 && (
                <div><dt>{t('site.booking.payNowLabel')}</dt><dd>{formatMoney(amounts.payNow)}</dd></div>
              )}
              {amounts.atVenue > 0 && (
                <div><dt>{t('site.booking.atVenueLabel')}</dt><dd>{formatMoney(amounts.atVenue)}</dd></div>
              )}
            </dl>

            {isCustomer && !verified && !needsVerify && (
              <p className="form-note mt-2">
                {t('site.booking.verifyFirst')}{' '}
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setNeedsVerify(true)}>{t('site.booking.verifyNow')}</button>
              </p>
            )}
            {needsVerify && (
              <div className="mt-2">
                <VerifyCode channel="EMAIL" destination={user?.email} autoSend={!verified} headingLevel={3}
                  onVerified={(u) => {
                    updateUser(u);
                    setNeedsVerify(false);
                    toast(t('site.verify.done'), 'success');
                    if (holdRef.current) confirmRef.current();
                  }}
                  onCancel={() => setNeedsVerify(false)} />
              </div>
            )}

            {bookError && <div className="form-error mt-2" role="alert">{bookError}</div>}

            <button type="button" className="btn btn-primary btn-block btn-lg mt-3"
              disabled={!hold || busy || payment.busy || cannotPay || (user && !isCustomer)}
              onClick={confirm} aria-describedby={!hold ? 'book-hint' : undefined}>
              {busy || payment.busy ? <><InlineLoader label={t('site.booking.booking')} /> {t('site.booking.booking')}</> : confirmLabel}
            </button>
            {!hold && <p id="book-hint" className="hint mt-1 center">{t('site.booking.pickTimeHint')}</p>}
            <p className="hint mt-2">{t('site.booking.policyHint', { hours: provider.policy?.cancellationCutoffHours ?? 24 })}</p>
          </div>
        </aside>
      </div>

      {payment.dialog}
    </div>
  );
}
