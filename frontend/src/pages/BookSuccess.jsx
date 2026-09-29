import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { formatDate, formatMoney, formatTime, downloadText, isValidTimeZone, timeZoneLabel } from '../utils/format';

export default function BookSuccess() {
  const { id } = useParams();
  const [appt, setAppt] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get(`/appointments/${id}`).then((r) => setAppt(r.data)).catch(() => setFailed(true));
  }, [id]);

  if (failed) {
    return (
      <div className="container page" style={{ maxWidth: 640 }}>
        <div className="empty card card-pad">
          <h1 style={{ fontSize: '1.3rem' }}>Booking saved</h1>
          <p className="mt-1">We couldn't load the details right now. You'll find this booking under My bookings.</p>
          <Link className="btn btn-primary mt-3" to="/dashboard">Go to my bookings</Link>
        </div>
      </div>
    );
  }
  if (!appt) return <div className="loader-screen" role="status"><div className="loader-box">Loading...</div></div>;

  const tz = [appt.timezone, appt.providerTimezone].find(isValidTimeZone);

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <div className="card card-pad" style={{ textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div aria-hidden="true" style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--green-bg)', color: 'var(--green)', display: 'grid', placeItems: 'center', fontSize: '2.6rem', margin: '0 auto' }}>{'\u2713'}</div>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 16 }}>Appointment booked!</h1>
        <p style={{ color: 'var(--muted)' }}>Here are your booking details. A confirmation has been sent.</p>

        <div className="card mt-3" style={{ border: '1.5px dashed var(--line)', textAlign: 'left' }}>
          <div className="card-pad">
            <div className="kv">
              <span className="k">Booking reference</span>
              <strong style={{ letterSpacing: 1 }} className="grad-text">{appt.bookingRef}</strong>
              <span className="k">Service</span><span>{appt.serviceName} @ {appt.providerName}</span>
              <span className="k">Date &amp; time</span><span>{formatDate(appt.date)} {'\u2022'} {formatTime(appt.startTime)} - {formatTime(appt.endTime)}{tz ? ` ${timeZoneLabel(tz)}` : ''}</span>
              <span className="k">Status</span><span><StatusBadge status={appt.status} /></span>
              <span className="k">Amount</span><span>{formatMoney(appt.finalAmount)}{appt.couponCode ? ` (${appt.couponCode})` : ''}</span>
              <span className="k">Payment</span><span><StatusBadge status={appt.payment?.method} /> {'\u2022'} <StatusBadge status={appt.payment?.status} /></span>
            </div>
          </div>
        </div>

        <div className="mt-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={() => api.get(`/appointments/${appt.id}/ics`, { responseType: 'text' })
            .then((r) => downloadText(`appointment-${appt.id}.ics`, typeof r.data === 'string' ? r.data : JSON.stringify(r.data))).catch(() => {})}>
            Add to calendar
          </button>
          <Link className="btn btn-outline" to="/dashboard">Go to my bookings</Link>
        </div>
      </div>
    </div>
  );
}