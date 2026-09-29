import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import AccountNav from '../../components/AccountNav';
import { InlineLoader } from '../../components/Loader';
import { useToast } from '../../components/Toast';
import {
  formatDate, formatDateTime, formatInZone, formatMoney, formatTime, formatViewerTime, downloadText, isValidTimeZone, nextDays
} from '../../utils/format';

// Statuses the customer can still cancel or move.
const CHANGEABLE = ['PENDING', 'CONFIRMED', 'RESCHEDULED'];
const SETTLED_PAYMENT = ['SUCCESS', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'];

export default function AppointmentDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [appt, setAppt] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const [days] = useState(() => nextDays(14, 0));
  const [date, setDate] = useState(days[0]?.iso || '');
  const [slots, setSlots] = useState(null);
  const [slotsError, setSlotsError] = useState('');
  const [slot, setSlot] = useState(null);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [busy, setBusy] = useState(false);
  const slotRequest = useRef(0);

  // A notice handed over by the booking flow is shown once, not again after a reload.
  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => api.get(`/appointments/${id}`)
    .then((r) => { setAppt(r.data); setLoadError(''); })
    .catch((e) => setLoadError(getErrorMessage(e, 'Could not load this appointment.'))), [id]);
  useEffect(() => { load(); }, [load]);

  const loadSlots = useCallback(async (forDate) => {
    if (!appt || !forDate) return;
    const requestId = ++slotRequest.current;
    setSlots(null);
    setSlot(null);
    setSlotsError('');
    try {
      const params = { providerId: appt.providerId, serviceId: appt.serviceId, date: forDate };
      if (appt.staffId) params.staffId = appt.staffId; // keep the same team member
      const { data } = await api.get('/slots', { params });
      if (requestId !== slotRequest.current) return;
      setSlots((Array.isArray(data) ? data : []).filter((s) => s.status === 'AVAILABLE'));
    } catch (e) {
      if (requestId !== slotRequest.current) return;
      setSlots([]);
      setSlotsError(getErrorMessage(e, 'Could not load available times.'));
    }
  }, [appt]);

  useEffect(() => {
    if (mode === 'reschedule') loadSlots(date);
  }, [mode, date, loadSlots]);

  const openReschedule = () => {
    setDate(days[0]?.iso || '');
    setMode('reschedule');
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/appointments/${id}/cancel`, reason ? { reason } : {});
      setAppt(data);
      setMode(null);
      setNotice('');
      toast('Appointment cancelled', 'success');
    } catch (e) { toast(getErrorMessage(e), 'error'); } finally { setBusy(false); }
  };

  const doReschedule = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const { data } = await api.put(`/appointments/${id}/reschedule`, {
        date, startTime: slot.startTime, endTime: slot.endTime
      });
      setAppt(data);
      setMode(null);
      toast('Appointment rescheduled', 'success');
    } catch (e) { toast(getErrorMessage(e, 'Could not reschedule'), 'error'); } finally { setBusy(false); }
  };

  const doReview = async () => {
    setBusy(true);
    try {
      await api.post('/reviews', { appointmentId: Number(id), rating: Number(review.rating), comment: review.comment });
      setMode(null);
      toast('Thanks for your review!', 'success');
      load();
    } catch (e) { toast(getErrorMessage(e), 'error'); } finally { setBusy(false); }
  };

  const payNow = async () => {
    setBusy(true);
    try {
      const order = (await api.post('/payments/create-order', null, { params: { appointmentId: Number(id) } })).data;
      await api.post('/payments/verify', {
        appointmentId: Number(id), method: 'RAZORPAY', orderId: order.orderId,
        razorpayPaymentId: 'pay_demo_' + Date.now()
      });
      setNotice('');
      toast('Payment successful! Appointment confirmed.', 'success');
      load();
    } catch (e) { toast(getErrorMessage(e, 'Payment failed'), 'error'); } finally { setBusy(false); }
  };

  if (!appt) {
    return (
      <div className="dash">
        <AccountNav />
        <div>
          {loadError ? (
            <div className="empty card card-pad">
              <h1 style={{ fontSize: '1.3rem' }}>Appointment unavailable</h1>
              <p className="mt-1" role="alert">{loadError}</p>
              <div className="mt-3" style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={load}>Try again</button>
                <Link className="btn btn-outline btn-sm" to="/dashboard">My bookings</Link>
              </div>
            </div>
          ) : (
            <div className="loader-screen" role="status"><div className="loader-box">Loading appointment...</div></div>
          )}
        </div>
      </div>
    );
  }

  const canChange = CHANGEABLE.includes(appt.status);
  const unpaid = appt.status === 'PENDING' && appt.payment?.method !== 'PAY_AT_VENUE'
    && !SETTLED_PAYMENT.includes(appt.payment?.status);
  const tz = [appt.timezone, appt.providerTimezone].find(isValidTimeZone) || null;
  const viewerTime = tz ? formatViewerTime(appt.date, appt.startTime, tz) : '';

  return (
    <div className="dash">
      <AccountNav />

      <div>
        <Link to="/dashboard" className="link-more" style={{ fontSize: '0.9rem' }}>&larr; Back</Link>

        {notice && (
          <div className="form-note mt-2" role="status">
            <span aria-hidden="true">{'ℹ'}</span>
            <span style={{ flex: 1 }}>{notice}</span>
            <button type="button" className="note-x" onClick={() => setNotice('')} aria-label="Dismiss message">
              <span aria-hidden="true">&#10005;</span>
            </button>
          </div>
        )}

        <div className="card card-pad mt-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{appt.serviceName}</h1>
                <StatusBadge status={appt.status} />
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 2 }}>{appt.bookingRef} {'•'} {appt.providerName}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {unpaid && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={payNow}>
                  {busy ? <InlineLoader /> : 'Pay now'}
                </button>
              )}
              {canChange && (
                <>
                  <button type="button" className="btn btn-outline btn-sm" onClick={openReschedule}>Reschedule</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setMode('cancel')}>Cancel</button>
                </>
              )}
              {appt.status === 'COMPLETED' && appt.payment?.status === 'SUCCESS' && appt.payment?.method !== 'PAY_AT_VENUE' && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => api.post(`/payments/${id}/refund`).then((r) => toast(r.data.message, 'success')).catch((e) => toast(getErrorMessage(e), 'error'))}>Request refund</button>
              )}
            </div>
          </div>

          <div className="divider-h" />
          <div className="kv">
            <span className="k">Date &amp; time</span>
            <span>
              {tz
                ? `${formatInZone(appt.date, appt.startTime, tz)} – ${formatTime(appt.endTime)}`
                : `${formatDate(appt.date)} • ${formatTime(appt.startTime)} - ${formatTime(appt.endTime)}`}
              {viewerTime && <span className="tz-note" style={{ display: 'block' }}>Your time: {viewerTime}</span>}
            </span>
            <span className="k">Staff</span><span>{appt.staffName || 'Any available member'}</span>
            <span className="k">Notes</span><span>{appt.notes || '—'}</span>
            <span className="k">Amount</span>
            <span>{formatMoney(appt.amount)}{appt.discount > 0 ? ` (discount ${formatMoney(appt.discount)}${appt.couponCode ? ` with ${appt.couponCode}` : ''})` : ''}</span>
            <span className="k">{unpaid ? 'Amount due' : 'Total paid'}</span><strong>{formatMoney(appt.finalAmount)}</strong>
            <span className="k">Payment</span>
            <span><StatusBadge status={appt.payment?.method} /> {'•'} <StatusBadge status={appt.payment?.status} /></span>
            {appt.payment?.txnId && <><span className="k">Txn ID</span><span>{appt.payment.txnId}</span></>}
            {appt.payment?.refundId && <><span className="k">Refund ID</span><span>{appt.payment.refundId}</span></>}
            {appt.cancelReason && <><span className="k">Cancel reason</span><span>{appt.cancelReason}</span></>}
            <span className="k">Booked on</span><span>{formatDateTime(appt.createdAt)}</span>
          </div>

          <div className="mt-3" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => api.get(`/appointments/${appt.id}/ics`, { responseType: 'text' })
              .then((r) => downloadText(`appointment-${appt.id}.ics`, typeof r.data === 'string' ? r.data : JSON.stringify(r.data))).catch(() => toast('Could not download the calendar file', 'error'))}>
              Add to calendar
            </button>
            {appt.status === 'COMPLETED' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setMode('review'); setReview({ rating: 5, comment: '' }); }}>
                Write a review
              </button>
            )}
          </div>
        </div>
      </div>

      {mode === 'cancel' && (
        <Modal title="Cancel appointment" onClose={() => setMode(null)} closeDisabled={busy}>
          <div className="field">
            <label htmlFor="cancel-reason">Reason (optional)</label>
            <textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the provider why you're cancelling" />
          </div>
          <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={doCancel}>
            {busy ? 'Cancelling...' : `Cancel booking ${appt.bookingRef}`}
          </button>
        </Modal>
      )}

      {mode === 'reschedule' && (
        <Modal title="Reschedule appointment" onClose={() => setMode(null)} closeDisabled={busy}>
          <div className="field">
            <label htmlFor="reschedule-date">New date</label>
            <select id="reschedule-date" value={date} onChange={(e) => setDate(e.target.value)}>
              {days.map((d) => <option key={d.iso} value={d.iso}>{d.isToday ? 'Today' : d.dow}, {d.day} {d.month}</option>)}
            </select>
          </div>
          {appt.staffName && <p className="hint">With {appt.staffName}</p>}
          <p className="sr-only" role="status">
            {slots === null ? 'Loading available times' : slotsError || `${slots.length} times available`}
          </p>
          {slots === null ? (
            <p className="muted-line"><InlineLoader /> Loading available times…</p>
          ) : slotsError ? (
            <div className="form-error">
              {slotsError}{' '}
              <button type="button" className="btn btn-outline btn-xs" onClick={() => loadSlots(date)}>Try again</button>
            </div>
          ) : slots.length === 0 ? (
            <p className="muted-line">No free times on this day. Pick another date.</p>
          ) : (
            <div className="slot-grid mt-2" role="group" aria-label="Available times">
              {slots.map((s) => {
                const selected = slot?.startTime === s.startTime;
                return (
                  <button key={s.id ?? s.startTime} type="button" className={`slot-btn ${selected ? 'selected' : ''}`}
                    aria-pressed={selected} onClick={() => setSlot(s)}>
                    {formatTime(s.startTime)}
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" className="btn btn-primary btn-block mt-3" disabled={!slot || busy} onClick={doReschedule}>
            {busy ? 'Rescheduling...' : 'Confirm new time'}
          </button>
        </Modal>
      )}

      {mode === 'review' && (
        <Modal title="Leave a review" onClose={() => setMode(null)} closeDisabled={busy}>
          <div className="field">
            <span className="field-label" id="review-rating-label">Rating</span>
            <div role="group" aria-labelledby="review-rating-label" style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="star-btn" onClick={() => setReview({ ...review, rating: n })}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={review.rating === n}
                  style={{ color: n <= review.rating ? '#f59e0b' : '#cbd5e1' }}>
                  <span aria-hidden="true">{'★'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="review-comment">Comment</label>
            <textarea id="review-comment" rows={3} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} placeholder="How was your experience?" />
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={doReview}>
            {busy ? 'Submitting...' : 'Submit review'}
          </button>
        </Modal>
      )}
    </div>
  );
}
