import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Loader, { InlineLoader } from '../components/Loader';
import Modal from '../components/Modal';
import { formatMoney, formatTime, nextDays } from '../utils/format';
import { getErrorMessage } from '../api/client';

export default function BookingWizard() {
  const { providerId, serviceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serviceIdSel, setServiceIdSel] = useState(Number(serviceId));
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState('');
  const [days] = useState(() => nextDays(7));
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [coupon, setCoupon] = useState('');
  const [couponInfo, setCouponInfo] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [method, setMethod] = useState('PAY_AT_VENUE');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [payModal, setPayModal] = useState(null);

  const svc = useMemo(
    () => (provider?.services || []).find((s) => s.id === Number(serviceIdSel)),
    [provider, serviceIdSel]
  );

  useEffect(() => {
    api.get(`/providers/${providerId}`)
      .then((r) => { setProvider(r.data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [providerId]);

  useEffect(() => { setDate(days[0]?.iso || ''); }, [days]);

  const loadSlots = () => {
    setSlots(null);
    setSlot(null);
    api.get(`/slots`, { params: { providerId, serviceId: serviceIdSel, staffId: staffId || undefined, date } })
      .then((r) => setSlots(r.data))
      .catch(() => setSlots([]));
  };

  useEffect(() => { if (date) loadSlots(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [date, serviceIdSel, staffId]);

  const applyCoupon = async () => {
    if (!coupon.trim()) { setCouponInfo(null); setCouponError(''); return; }
    const amount = svc ? svc.price : 0;
    try {
      const { data } = await api.get('/coupons/validate', { params: { code: coupon, amount } });
      setCouponInfo(data);
      setCouponError(data.valid ? '' : data.message);
      if (!data.valid) toast(data.message, 'error');
      else toast(`Coupon applied: save ${formatMoney(data.discount)}`, 'success');
    } catch (e) {
      setCouponError(getErrorMessage(e));
      setCouponInfo(null);
    }
  };

  const finalAmount = svc ? svc.price - (couponInfo?.valid ? couponInfo.discount : 0) : 0;

  const createBooking = async () => {
    setBusy(true);
    const payload = {
      providerId: Number(providerId),
      serviceId: Number(serviceIdSel),
      staffId: staffId ? Number(staffId) : null,
      date, startTime: slot.startTime, endTime: slot.endTime,
      notes: notes || null,
      couponCode: (couponInfo?.valid && coupon.trim()) ? coupon.trim() : null,
      paymentMethod: method
    };
    try {
      const { data } = await api.post('/appointments', payload);
      if (method === 'PAY_AT_VENUE') {
        toast('Appointment booked successfully!', 'success');
        navigate(`/book/success/${data.id}`, { replace: true });
      } else {
        const order = (await api.post('/payments/create-order', null, { params: { appointmentId: data.id } })).data;
        setPayModal({ appointment: data, order });
      }
    } catch (e) {
      toast(getErrorMessage(e, 'Booking failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmPay = async () => {
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

  const cancelPay = async () => {
    try {
      await api.post(`/payments/${payModal.appointment.id}/fail`);
      toast('Payment cancelled. Booking released.', 'error');
    } catch {}
    setPayModal(null);
    loadSlots();
  };

  if (loading) return <Loader />;
  if (!provider) return <div className="container page"><div className="empty">Provider not found.</div></div>;
  if (!user) return (
    <div className="container page" style={{ maxWidth: 520, textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Sign in to book</h1>
      <p style={{ color: 'var(--muted)', marginTop: 8 }}>You'll need an account to book an appointment.</p>
      <Link className="btn btn-primary mt-3" to="/login" state={{ from: `/book/${providerId}/${serviceId}` }}>Sign in</Link>
    </div>
  );

  const services = provider.services || [];

  return (
    <div className="container page">
      <Link to={`/providers/${providerId}`} className="link-more" style={{ fontSize: '0.9rem' }}>&larr; {provider.businessName}</Link>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 8 }}>Book your appointment</h1>

      <div className="dash mt-3" style={{ gridTemplateColumns: '1fr 360px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="card card-pad">
            <h3 style={{ fontWeight: 800, marginBottom: 14 }}>1. Choose a service</h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {services.map((s) => (
                <label key={s.id} className="list-item"
                  style={{ cursor: 'pointer', border: `1.5px solid ${Number(serviceIdSel) === s.id ? 'var(--brand-500)' : 'transparent'}`, borderRadius: 12, padding: '12px 16px', background: Number(serviceIdSel) === s.id ? '#f5f3ff' : 'transparent' }}>
                  <input type="radio" name="svc" checked={Number(serviceIdSel) === s.id}
                    onChange={() => { setServiceIdSel(s.id); setSlots(null); setSlot(null); setCouponInfo(null); }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{s.durationMin + s.bufferMin} min</div>
                  </div>
                  <strong style={{ fontSize: '1.05rem' }}>{formatMoney(s.price)}</strong>
                </label>
              ))}
            </div>
          </section>

          {provider.staff?.length > 0 && (
            <section className="card card-pad">
              <h3 style={{ fontWeight: 800, marginBottom: 8 }}>2. Team member <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: '0.9rem' }}>(optional)</span></h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <button className={`chip ${staffId === '' ? 'active' : ''}`} onClick={() => { setStaffId(''); setSlots(null); setSlot(null); }}>Anyone</button>
                {provider.staff.filter((s) => !svc || svc.staffIds?.includes(s.id)).map((s) => (
                  <button key={s.id} className={`chip ${String(staffId) === String(s.id) ? 'active' : ''}`}
                    onClick={() => { setStaffId(s.id); setSlots(null); setSlot(null); }}>{s.name}</button>
                ))}
              </div>
            </section>
          )}

          <section className="card card-pad">
            <h3 style={{ fontWeight: 800, marginBottom: 14 }}>3. Pick a date &amp; time</h3>
            <div className="date-tabs">
              {days.map((d) => (
                <button key={d.iso} className={`date-tab ${date === d.iso ? 'active' : ''}`} onClick={() => { setDate(d.iso); }}>
                  <span className="dow">{d.dow}</span>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{d.day}</span>
                  <span className="dow">{d.month}</span>
                </button>
              ))}
            </div>

            <div className="mt-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={loadSlots} disabled={!date}>
                Refresh slots
              </button>
            </div>

            {slots && (
              <div className="mt-3">
                {slots.length === 0 ? (
                  <p style={{ color: 'var(--muted)' }}>No available slots for this day. Try another date.</p>
                ) : (
                  <div className="slot-grid">
                    {slots.filter((s) => s.status === 'AVAILABLE').map((s) => (
                      <button key={s.id} className={`slot-btn ${slot?.id === s.id ? 'selected' : ''}`}
                        onClick={() => setSlot(s)}>
                        <div>{formatTime(s.startTime)}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 500, opacity: 0.75 }}>{formatTime(s.endTime)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div style={{ position: 'sticky', top: 100 }}>
          <div className="card card-pad">
            <h3 style={{ fontWeight: 800, marginBottom: 14 }}>Booking summary</h3>
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
                    <span style={{ color: 'var(--muted)' }}>{formatTime(slot.startTime)}</span>
                    <span>{new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                )}

                <div className="divider-h" />

                <div className="field">
                  <label>Coupon code</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="e.g. FIRST50" />
                    <button type="button" className="btn btn-outline" onClick={applyCoupon}>Apply</button>
                  </div>
                  {couponError && <span className="hint" style={{ color: 'var(--red)' }}>{couponError}</span>}
                  {couponInfo?.valid && <span className="hint" style={{ color: 'var(--green)' }}>You save {formatMoney(couponInfo.discount)}</span>}
                </div>

                <div className="field">
                  <label>Payment method</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="PAY_AT_VENUE">Pay at venue</option>
                    <option value="RAZORPAY">Pay online (demo)</option>
                  </select>
                </div>

                <div className="field">
                  <label>Notes <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" />
                </div>

                <div className="kv mt-2">
                  <span className="k">Subtotal</span><strong>{formatMoney(svc.price)}</strong>
                  <span className="k">Discount</span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{couponInfo?.valid ? '-' + formatMoney(couponInfo.discount) : '\u2013'}</span>
                </div>
                <div className="divider-h" />
                <div className="kv" style={{ alignItems: 'baseline' }}>
                  <span className="k" style={{ fontWeight: 800 }}>Total</span>
                  <strong style={{ fontSize: '1.5rem' }}>{formatMoney(finalAmount)}</strong>
                </div>

                <button className="btn btn-primary btn-block btn-lg mt-3" disabled={!slot || busy}
                  onClick={createBooking}>
                  {busy ? <InlineLoader /> : method === 'RAZORPAY' ? 'Proceed to payment' : 'Confirm booking'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {payModal && (
        <Modal title="Demo payment" onClose={cancelPay}>
          <div className="demo-accounts">
            <strong>Test checkout (Razorpay simulation)</strong>
            <p className="mt-1">This platform runs in demo payment mode. No real money moves.</p>
          </div>
          <div className="kv mt-3">
            <span className="k">Booking</span><span>{payModal.appointment.bookingRef}</span>
            <span className="k">Order ID</span><span>{payModal.order.orderId}</span>
            <span className="k">Amount</span><strong style={{ fontSize: '1.2rem' }}>{formatMoney(payModal.order.amount)}</strong>
          </div>
          <button className="btn btn-success btn-block btn-lg mt-3" disabled={busy} onClick={confirmPay}>
            {busy ? <InlineLoader /> : '\u{1F4B3}  Pay now (simulate)'}
          </button>
          <button className="btn btn-ghost btn-block mt-2" onClick={cancelPay} disabled={busy}>Cancel payment</button>
        </Modal>
      )}
    </div>
  );
}