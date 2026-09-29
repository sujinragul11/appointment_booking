import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Loader, { InlineLoader } from '../components/Loader';
import Modal from '../components/Modal';
import Calendar from '../components/Calendar';
import { useI18n } from '../i18n';
import {
  addDaysISO, formatMoney, formatTime, isValidTimeZone, nextDays, parseISODate, timeZoneLabel, todayISO
} from '../utils/format';
import { loginPath } from '../utils/routes';
import { isOpenSlot, parseSlots } from '../utils/slots';

const isActive = (x) => x && x.active !== false;
const DAY_NUMBERS = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 };
// Java DayOfWeek numbering (1 = Monday ... 7 = Sunday); also accepts enum names. null if unknown.
const dayNumber = (v) => {
  const n = Number(v);
  return n >= 1 && n <= 7 ? n : DAY_NUMBERS[String(v).toUpperCase()] || null;
};
const slotKey = (s) => (s ? s.id ?? `${s.startTime}-${s.staffId ?? ''}` : null);
const isWideScreen = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(min-width: 768px)').matches;

export default function BookingWizard() {
  const { providerId, serviceId } = useParams();
  const { user } = useAuth();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [provider, setProvider] = useState(null);
  const [avail, setAvail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serviceIdSel, setServiceIdSel] = useState(Number(serviceId));
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(todayISO);
  const [showCalendar, setShowCalendar] = useState(isWideScreen);
  const [slots, setSlots] = useState(null);
  const [slotsError, setSlotsError] = useState('');
  const [closedMessage, setClosedMessage] = useState('');
  const [slot, setSlot] = useState(null);
  const [coupon, setCoupon] = useState('');
  const [couponInfo, setCouponInfo] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [method, setMethod] = useState('PAY_AT_VENUE');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const slotRequest = useRef(0);
  const couponRef = useRef('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/providers/${providerId}`)
      .then((r) => { if (active) setProvider(r.data); })
      .catch(() => { if (active) setProvider(null); })
      .finally(() => { if (active) setLoading(false); });
    // Working hours are only used to grey out closed days; the slot search is authoritative.
    api.get(`/providers/${providerId}/availability`)
      .then((r) => { if (active) setAvail(r.data); })
      .catch(() => {});
    return () => { active = false; };
  }, [providerId]);

  // Inactive services and staff can't be booked.
  const services = useMemo(() => (provider?.services || []).filter(isActive), [provider]);
  const svc = useMemo(() => services.find((s) => s.id === Number(serviceIdSel)), [services, serviceIdSel]);
  const staffOptions = useMemo(
    () => (provider?.staff || []).filter(isActive).filter((s) => !svc || (svc.staffIds || []).includes(s.id)),
    [provider, svc]
  );

  // The service in the URL may be inactive or gone: fall back to the first bookable one.
  useEffect(() => {
    if (provider && !svc && services.length) setServiceIdSel(services[0].id);
  }, [provider, svc, services]);

  // A team member who doesn't offer the chosen service can't stay selected.
  useEffect(() => {
    if (staffId && !staffOptions.some((s) => String(s.id) === String(staffId))) setStaffId('');
  }, [staffOptions, staffId]);

  const today = todayISO();
  const maxDays = (svc?.maxAdvanceBookingDays > 0 ? svc.maxAdvanceBookingDays
    : provider?.policy?.maxAdvanceBookingDays ?? provider?.maxAdvanceBookingDays) || 30;
  const maxDate = addDaysISO(today, maxDays);
  const days = useMemo(() => nextDays(7, 0), [today]);
  const tz = isValidTimeZone(provider?.timezone) ? provider.timezone : null;

  const hours = useMemo(() => ({
    openDays: new Set((avail?.availability || []).filter(isActive).map((a) => dayNumber(a.dayOfWeek)).filter(Boolean)),
    overrides: new Map((avail?.overrides || []).map((o) => [String(o.date), o.available !== false]))
  }), [avail]);

  const isDateDisabled = useCallback((iso) => {
    if (iso < today || iso > maxDate) return true;
    if (hours.overrides.has(iso)) return !hours.overrides.get(iso);
    if (hours.openDays.size === 0) return false; // hours unknown: let the slot search decide
    const dow = parseISODate(iso).getDay();
    return !hours.openDays.has(dow === 0 ? 7 : dow);
  }, [today, maxDate, hours]);

  // Start on the first open day (today may be closed).
  useEffect(() => {
    if (!provider || !isDateDisabled(date)) return;
    let d = today;
    for (let i = 0; i < maxDays && isDateDisabled(d); i++) d = addDaysISO(d, 1);
    if (!isDateDisabled(d)) setDate(d);
  }, [provider, isDateDisabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSlots = useCallback(async () => {
    // Only the latest request may update state: switching dates quickly must not let an
    // older, slower response overwrite the slots of the date now selected.
    const id = ++slotRequest.current;
    setSlot(null);
    setSlotsError('');
    setClosedMessage('');
    setSlots(null);
    if (!svc || !date) return;
    try {
      const { data } = await api.get('/slots', {
        params: { providerId, serviceId: svc.id, staffId: staffId || undefined, date }
      });
      if (id !== slotRequest.current) return;
      const parsed = parseSlots(data);
      setSlots(parsed.slots);
      setClosedMessage(parsed.message);
    } catch (e) {
      if (id === slotRequest.current) {
        setSlots([]);
        setSlotsError(getErrorMessage(e, 'Could not load available times.'));
      }
    }
  }, [providerId, svc, staffId, date]);

  useEffect(() => {
    if (user && provider) loadSlots();
  }, [user, provider, loadSlots]);

  const onCouponChange = (value) => {
    const code = value.toUpperCase();
    couponRef.current = code;
    setCoupon(code);
    // An applied discount belongs to the code it was validated for.
    setCouponInfo(null);
    setCouponError('');
  };

  const applyCoupon = async () => {
    const code = coupon.trim();
    if (!code) { setCouponInfo(null); setCouponError(''); return; }
    setCouponBusy(true);
    try {
      const { data } = await api.get('/coupons/validate', { params: { code, amount: svc ? svc.price : 0 } });
      if (couponRef.current.trim() !== code) return; // edited while validating
      setCouponInfo(data);
      setCouponError(data.valid ? '' : data.message || 'This coupon cannot be applied.');
      if (data.valid) toast(`Coupon applied: save ${formatMoney(data.discount)}`, 'success');
    } catch (e) {
      if (couponRef.current.trim() !== code) return;
      setCouponInfo(null);
      setCouponError(getErrorMessage(e, 'Could not validate the coupon.'));
    } finally {
      setCouponBusy(false);
    }
  };

  const discount = couponInfo?.valid ? Number(couponInfo.discount) || 0 : 0;
  const finalAmount = svc ? Math.max(0, svc.price - discount) : 0;

  const createBooking = async () => {
    if (!slot || !svc || busy) return;
    setBusy(true);
    const payload = {
      providerId: Number(providerId),
      serviceId: svc.id,
      staffId: staffId ? Number(staffId) : null,
      date, startTime: slot.startTime, endTime: slot.endTime,
      notes: notes || null,
      couponCode: couponInfo?.valid && coupon.trim() ? coupon.trim() : null,
      paymentMethod: method
    };

    let appointment;
    try {
      appointment = (await api.post('/appointments', payload)).data;
    } catch (e) {
      toast(getErrorMessage(e, 'Booking failed'), 'error');
      setBusy(false);
      loadSlots(); // the slot may have just been taken
      return;
    }

    if (method === 'PAY_AT_VENUE') {
      toast('Appointment booked successfully!', 'success');
      navigate(`/book/success/${appointment.id}`, { replace: true });
      return;
    }

    try {
      const order = (await api.post('/payments/create-order', null, { params: { appointmentId: appointment.id } })).data;
      setPayModal({ appointment, order });
    } catch (e) {
      // The booking exists; only the payment could not start. Don't report it as a failed booking.
      const notice = `Booking ${appointment.bookingRef || ''} is reserved, but the payment could not be started`
        + ` (${getErrorMessage(e, 'payment service unavailable')}). You can pay or cancel it here.`;
      toast('Booking reserved — payment could not be started', 'error');
      navigate(`/appointments/${appointment.id}`, { replace: true, state: { notice } });
    } finally {
      setBusy(false);
    }
  };

  const confirmPay = async () => {
    if (!payModal || busy) return;
    setBusy(true);
    try {
      await api.post('/payments/verify', {
        appointmentId: payModal.appointment.id,
        method: 'RAZORPAY',
        orderId: payModal.order.orderId,
        razorpayPaymentId: 'pay_demo_' + Date.now()
      });
      toast('Payment successful! Appointment confirmed.', 'success');
      navigate(`/book/success/${payModal.appointment.id}`, { replace: true });
    } catch (e) {
      toast(getErrorMessage(e, 'Payment failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Only the explicit "Cancel payment" button releases the booking.
  const cancelPay = async () => {
    if (!payModal || busy) return;
    setBusy(true);
    try {
      await api.post(`/payments/${payModal.appointment.id}/fail`);
      toast('Payment cancelled. Booking released.', 'info');
      setPayModal(null);
      loadSlots();
    } catch (e) {
      toast(getErrorMessage(e, 'Could not cancel the payment'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Closing the dialog (X / Escape) keeps the booking; it can be paid or cancelled from its page.
  const leavePayment = () => {
    if (!payModal || busy) return;
    const { appointment } = payModal;
    navigate(`/appointments/${appointment.id}`, {
      replace: true,
      state: { notice: `Booking ${appointment.bookingRef || ''} is reserved but not paid yet. Pay now or cancel it here.` }
    });
  };

  if (loading) return <Loader />;
  if (!provider) return <div className="container page"><div className="empty">Provider not found.</div></div>;
  if (!user) {
    const here = location.pathname + location.search;
    return (
      <div className="container page" style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Sign in to book</h1>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>You'll need an account to book an appointment.</p>
        <Link className="btn btn-primary mt-3" to={loginPath(here)} state={{ from: here }}>Sign in</Link>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="container page" style={{ maxWidth: 560 }}>
        <Link to={`/providers/${providerId}`} className="link-more" style={{ fontSize: '0.9rem' }}>&larr; {provider.businessName}</Link>
        <div className="empty card card-pad mt-2">
          <h1 style={{ fontSize: '1.3rem' }}>No bookable services</h1>
          <p className="mt-1">{provider.businessName} isn't taking online bookings right now.</p>
        </div>
      </div>
    );
  }

  const available = (slots || []).filter(isOpenSlot);
  const showStaff = staffOptions.length > 0;
  const whenStep = showStaff ? 3 : 2;
  const dateLabel = parseISODate(date)?.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) || date;
  const slotStatus = slots === null ? 'Loading available times' : slotsError
    ? slotsError : `${available.length} time${available.length === 1 ? '' : 's'} available on ${dateLabel}`;

  return (
    <div className="container page">
      <Link to={`/providers/${providerId}`} className="link-more" style={{ fontSize: '0.9rem' }}>&larr; {provider.businessName}</Link>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 8 }}>Book your appointment</h1>

      <div className="booking-grid mt-3">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <section className="card card-pad" aria-labelledby="step-service">
            <h2 id="step-service" className="step-title">1. Choose a service</h2>
            <div role="radiogroup" aria-labelledby="step-service" style={{ display: 'flex', flexDirection: 'column' }}>
              {services.map((s) => {
                const checked = svc?.id === s.id;
                return (
                  <label key={s.id} className={`list-item service-option ${checked ? 'selected' : ''}`}>
                    <input type="radio" name="svc" checked={checked}
                      onChange={() => { setServiceIdSel(s.id); setCouponInfo(null); setCouponError(''); }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{s.name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{s.durationMin + (s.bufferMin || 0)} min</div>
                    </div>
                    <strong style={{ fontSize: '1.05rem' }}>{formatMoney(s.price)}</strong>
                  </label>
                );
              })}
            </div>
          </section>

          {showStaff && (
            <section className="card card-pad" aria-labelledby="step-staff">
              <h2 id="step-staff" className="step-title">2. Team member <span className="step-optional">(optional)</span></h2>
              <div role="group" aria-labelledby="step-staff" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" className={`chip ${staffId === '' ? 'active' : ''}`} aria-pressed={staffId === ''}
                  onClick={() => setStaffId('')}>Anyone</button>
                {staffOptions.map((s) => (
                  <button key={s.id} type="button" className={`chip ${String(staffId) === String(s.id) ? 'active' : ''}`}
                    aria-pressed={String(staffId) === String(s.id)} onClick={() => setStaffId(s.id)}>{s.name}</button>
                ))}
              </div>
            </section>
          )}

          <section className="card card-pad" aria-labelledby="step-when">
            <h2 id="step-when" className="step-title">{whenStep}. Pick a date &amp; time</h2>

            <div className="date-tabs" role="group" aria-label="Next 7 days">
              {days.map((d) => (
                <button key={d.iso} type="button" className={`date-tab ${date === d.iso ? 'active' : ''}`}
                  aria-pressed={date === d.iso} disabled={isDateDisabled(d.iso)}
                  aria-label={parseISODate(d.iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                  onClick={() => setDate(d.iso)}>
                  <span className="dow">{d.isToday ? 'Today' : d.dow}</span>
                  <span className="day-num">{d.day}</span>
                  <span className="dow">{d.month}</span>
                </button>
              ))}
            </div>

            <button type="button" className="btn btn-ghost btn-sm mt-2" aria-expanded={showCalendar} aria-controls="booking-calendar"
              onClick={() => setShowCalendar((v) => !v)}>
              {showCalendar ? 'Hide calendar' : 'Show calendar for more dates'}
            </button>

            <div className={`picker-grid mt-2 ${showCalendar ? 'with-calendar' : ''}`}>
              <div id="booking-calendar" hidden={!showCalendar}>
                {showCalendar && (
                  <Calendar value={date} onChange={setDate} minDate={today} maxDate={maxDate}
                    isDisabled={isDateDisabled} label="Appointment date" />
                )}
              </div>

              <div className="slot-panel">
                <div className="slot-panel-head">
                  <h3>{dateLabel}</h3>
                  <button type="button" className="btn btn-outline btn-xs" onClick={loadSlots} disabled={!date || !svc}>
                    Refresh slots
                  </button>
                </div>
                {tz && <p className="tz-note">Times shown in {timeZoneLabel(tz)} ({tz})</p>}
                <p className="sr-only" role="status">{slotStatus}</p>

                {slots === null ? (
                  <p className="muted-line"><InlineLoader /> Loading available times…</p>
                ) : slotsError ? (
                  <div className="form-error">
                    {slotsError}{' '}
                    <button type="button" className="btn btn-outline btn-xs" onClick={loadSlots}>Try again</button>
                  </div>
                ) : available.length === 0 ? (
                  <p className="muted-line">{closedMessage || 'No available slots for this day. Try another date.'}</p>
                ) : (
                  <div className="slot-grid" role="group" aria-label="Available times">
                    {available.map((s) => {
                      const selected = slotKey(slot) === slotKey(s);
                      return (
                        <button key={slotKey(s)} type="button" className={`slot-btn ${selected ? 'selected' : ''}`}
                          aria-pressed={selected} aria-label={`${formatTime(s.startTime)} to ${formatTime(s.endTime)}`}
                          onClick={() => setSlot(s)}>
                          <span className="slot-start">{formatTime(s.startTime)}</span>
                          <span className="slot-end">{formatTime(s.endTime)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="booking-summary" aria-labelledby="summary-title">
          <div className="card card-pad">
            <h2 id="summary-title" className="step-title">Booking summary</h2>
            {!svc ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Select a service to continue</p>
            ) : (
              <>
                <div className="kv" style={{ gridTemplateColumns: '1fr auto', marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>{svc.name}</span>
                  <strong>{formatMoney(svc.price)}</strong>
                </div>
                {slot && (
                  <div className="kv" style={{ gridTemplateColumns: '1fr auto', marginBottom: 6, fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--muted)' }}>{formatTime(slot.startTime)}{tz ? ` ${timeZoneLabel(tz)}` : ''}</span>
                    <span>{parseISODate(date)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                )}

                <div className="divider-h" />

                <div className="field">
                  <label htmlFor="coupon-code">Coupon code</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="coupon-code" value={coupon} onChange={(e) => onCouponChange(e.target.value)} placeholder="e.g. FIRST50"
                      autoComplete="off" aria-describedby="coupon-status" aria-invalid={Boolean(couponError) || undefined}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }} />
                    <button type="button" className="btn btn-outline" onClick={applyCoupon} disabled={!coupon.trim() || couponBusy}>
                      {couponBusy ? <InlineLoader /> : 'Apply'}
                    </button>
                  </div>
                  <div id="coupon-status" aria-live="polite">
                    {couponError && <span className="hint error-text">{couponError}</span>}
                    {couponInfo?.valid && <span className="hint success-text">You save {formatMoney(couponInfo.discount)}</span>}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="payment-method">Payment method</label>
                  <select id="payment-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="PAY_AT_VENUE">Pay at venue</option>
                    <option value="RAZORPAY">Pay online (demo)</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="booking-notes">Notes <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
                  <textarea id="booking-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" />
                </div>

                <div className="kv mt-2">
                  <span className="k">Subtotal</span><strong>{formatMoney(svc.price)}</strong>
                  <span className="k">Discount</span><span className="success-text" style={{ fontWeight: 700 }}>{discount ? '-' + formatMoney(discount) : '–'}</span>
                </div>
                <div className="divider-h" />
                <div className="kv" style={{ alignItems: 'baseline' }}>
                  <span className="k" style={{ fontWeight: 800 }}>Total</span>
                  <strong style={{ fontSize: '1.5rem' }}>{formatMoney(finalAmount)}</strong>
                </div>

                <button type="button" className="btn btn-primary btn-block btn-lg mt-3" disabled={!slot || busy}
                  onClick={createBooking} aria-describedby={!slot ? 'book-hint' : undefined}>
                  {busy ? <InlineLoader /> : method === 'RAZORPAY' ? 'Proceed to payment' : 'Confirm booking'}
                </button>
                {!slot && <p id="book-hint" className="hint mt-1" style={{ textAlign: 'center' }}>Pick a time to continue</p>}
              </>
            )}
          </div>
        </aside>
      </div>

      {payModal && (
        <Modal title="Demo payment" onClose={leavePayment} closeDisabled={busy} closeOnBackdrop={false}>
          <div className="demo-accounts">
            <strong>Test checkout (Razorpay simulation)</strong>
            <p className="mt-1">This platform runs in demo payment mode. No real money moves.</p>
          </div>
          <div className="kv mt-3">
            <span className="k">Booking</span><span>{payModal.appointment.bookingRef}</span>
            <span className="k">Order ID</span><span>{payModal.order.orderId}</span>
            <span className="k">Amount</span><strong style={{ fontSize: '1.2rem' }}>{formatMoney(payModal.order.amount)}</strong>
          </div>
          <button type="button" className="btn btn-success btn-block btn-lg mt-3" disabled={busy} onClick={confirmPay}>
            {busy ? <InlineLoader /> : <><span aria-hidden="true">{'\u{1F4B3}'}</span> Pay now (simulate)</>}
          </button>
          <button type="button" className="btn btn-ghost btn-block mt-2" onClick={cancelPay} disabled={busy}>Cancel payment</button>
          <p className="hint mt-2" style={{ textAlign: 'center' }}>Closing this window keeps your booking reserved so you can pay later.</p>
        </Modal>
      )}
    </div>
  );
}
