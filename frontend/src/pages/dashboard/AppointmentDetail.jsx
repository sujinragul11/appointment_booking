import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatDateTime, formatTime, formatMoney, downloadText } from '../../utils/format';
import { nextDays } from '../../utils/format';
import StarRating from '../../components/StarRating';
import { getErrorMessage } from '../../api/client';

export default function AppointmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [appt, setAppt] = useState(null);
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const [days] = useState(() => nextDays(7));
  const [date, setDate] = useState(days[0]?.iso || '');
  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState(null);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/appointments/${id}`).then((r) => setAppt(r.data)).catch(() => {});
  useEffect(() => { load(); }, [id]);

  const openReschedule = () => {
    setMode('reschedule');
    setSlots([]);
    setSlot(null);
    setDate(days[0]?.iso || '');
  };

  const loadSlots = async () => {
    setSlots([]);
    const params = { providerId: appt.providerId, serviceId: appt.serviceId, date };
    const { data } = await api.get('/slots', { params });
    setSlots(data.filter((s) => s.status === 'AVAILABLE'));
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/appointments/${id}/cancel`, reason ? { reason } : {});
      setAppt(data);
      setMode(null);
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
      toast('Payment successful! Appointment confirmed.', 'success');
      load();
    } catch (e) { toast(getErrorMessage(e, 'Payment failed'), 'error'); } finally { setBusy(false); }
  };

  if (!appt) return <div className="loader-screen"><div className="loader-box">Loading appointment...</div></div>;

  const isUpcoming = ['CONFIRMED', 'PENDING'].includes(appt.status);

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard">My bookings</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/addresses">Addresses</Link>
          <Link to="/notifications">Notifications</Link>
        </nav>
      </aside>

      <div>
        <Link to="/dashboard" className="link-more" style={{ fontSize: '0.9rem' }}>&larr; Back</Link>

        <div className="card card-pad mt-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{appt.serviceName}</h1>
                <StatusBadge status={appt.status} />
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 2 }}>{appt.bookingRef} {'\u2022'} {appt.providerName}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {isUpcoming && appt.status !== 'PENDING' && (
                <>
                  <button className="btn btn-outline btn-sm" onClick={openReschedule}>Reschedule</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setMode('cancel')}>Cancel</button>
                </>
              )}
              {appt.status === 'PENDING' && (
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={payNow}>Pay now</button>
              )}
              {appt.status === 'COMPLETED' && appt.payment?.status === 'SUCCESS' && appt.payment?.method !== 'PAY_AT_VENUE' && (
                <button className="btn btn-outline btn-sm" onClick={() => api.post(`/payments/${id}/refund`).then((r) => toast(r.data.message, 'success')).catch((e) => toast(getErrorMessage(e), 'error'))}>Request refund</button>
              )}
            </div>
          </div>

          <div className="divider-h" />
          <div className="kv">
            <span className="k">Date &amp; time</span>
            <span>{appt.date} {'\u2022'} {formatTime(appt.startTime)} - {formatTime(appt.endTime)}</span>
            <span className="k">Staff</span><span>{appt.staffName || 'Any available member'}</span>
            <span className="k">Notes</span><span>{appt.notes || '\u2014'}</span>
            <span className="k">Amount</span>
            <span>{formatMoney(appt.amount)}{appt.discount > 0 ? ` (discount ${formatMoney(appt.discount)}${appt.couponCode ? ` with ${appt.couponCode}` : ''})` : ''}</span>
            <span className="k">Total paid</span><strong>{formatMoney(appt.finalAmount)}</strong>
            <span className="k">Payment</span>
            <span><StatusBadge status={appt.payment?.method} /> {'\u2022'} <StatusBadge status={appt.payment?.status} /></span>
            {appt.payment?.txnId && <><span className="k">Txn ID</span><span>{appt.payment.txnId}</span></>}
            {appt.payment?.refundId && <><span className="k">Refund ID</span><span>{appt.payment.refundId}</span></>}
            {appt.cancelReason && <><span className="k">Cancel reason</span><span>{appt.cancelReason}</span></>}
            <span className="k">Booked on</span><span>{formatDateTime(appt.createdAt)}</span>
          </div>

          <div className="mt-3" style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline btn-sm" onClick={() => api.get(`/appointments/${appt.id}/ics`, { responseType: 'text' })
              .then((r) => downloadText(`appointment-${appt.id}.ics`, typeof r.data === 'string' ? r.data : JSON.stringify(r.data))).catch(() => {})}>
              Add to calendar
            </button>
            {appt.status === 'COMPLETED' && (
              <button className="btn btn-primary btn-sm" onClick={() => { setMode('review'); setReview({ rating: 5, comment: '' }); }}>
                Write a review
              </button>
            )}
          </div>
        </div>
      </div>

      {mode === 'cancel' && (
        <Modal title="Cancel appointment" onClose={() => setMode(null)}>
          <div className="field">
            <label>Reason (optional)</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the provider why you're cancelling" />
          </div>
          <button className="btn btn-danger btn-block" disabled={busy} onClick={doCancel}>
            {busy ? 'Cancelling...' : `Cancel booking ${appt.bookingRef}`}
          </button>
        </Modal>
      )}

      {mode === 'reschedule' && (
        <Modal title="Reschedule appointment" onClose={() => setMode(null)}>
          <div className="field">
            <label>New date</label>
            <select value={date} onChange={async (e) => { setDate(e.target.value); setSlots([]); setSlot(null); }}>
              {days.map((d) => <option key={d.iso} value={d.iso}>{d.dow}, {d.day} {d.month}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={loadSlots}>Show slots</button>
          {slots.length > 0 && (
            <div className="slot-grid mt-2">
              {slots.map((s) => (
                <button key={s.id} className={`slot-btn ${slot?.id === s.id ? 'selected' : ''}`} onClick={() => setSlot(s)}>
                  {formatTime(s.startTime)}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-primary btn-block mt-3" disabled={!slot || busy} onClick={doReschedule}>
            {busy ? 'Rescheduling...' : 'Confirm new time'}
          </button>
        </Modal>
      )}

      {mode === 'review' && (
        <Modal title="Leave a review" onClose={() => setMode(null)}>
          <div className="field">
            <label>Rating</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setReview({ ...review, rating: n })}
                  style={{ fontSize: '1.8rem', background: 'none', border: 0, color: n <= review.rating ? '#f59e0b' : '#e2e8f0', cursor: 'pointer' }}>{'\u2605'}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Comment</label>
            <textarea rows={3} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} placeholder="How was your experience?" />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={doReview}>
            {busy ? 'Submitting...' : 'Submit review'}
          </button>
        </Modal>
      )}
    </div>
  );
}