import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import { formatMoney, formatTime } from '../../utils/format';

export default function ProviderEarnings() {
  const [stats, setStats] = useState(null);
  const [appts, setAppts] = useState(null);

  useEffect(() => {
    api.get('/provider/stats').then((r) => setStats(r.data)).catch(() => {});
    api.get('/appointments/provider').then((r) => setAppts(r.data)).catch(() => setAppts([]));
  }, []);

  const paid = (appts || []).filter((a) => a.payment && a.payment.status === 'SUCCESS' || a.status === 'COMPLETED');

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/provider">Overview</Link>
          <Link to="/dashboard/provider/appointments">Appointments</Link>
          <Link to="/dashboard/provider/services">Services</Link>
          <Link to="/dashboard/provider/staff">Team</Link>
          <Link to="/dashboard/provider/availability">Availability</Link>
          <Link to="/dashboard/provider/earnings" className="active">Earnings</Link>
          <Link to="/dashboard/provider/settings">Settings</Link>
        </nav>
      </aside>

      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Earnings</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Monthly revenue and payment history</p>

        <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div className="avatar" style={{ width: 56, height: 56, background: 'var(--gradient-soft)', color: 'var(--brand-700)' }}>{'\u{1F4B0}'}</div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>This month{'\u2019'}s revenue</div>
            <div className="grad-text" style={{ fontSize: '2.2rem', fontWeight: 800 }}>{formatMoney(stats?.monthlyRevenue || 0)}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><div style={{ fontWeight: 800 }}>{stats?.completedAppointments || 0}</div><div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Completed</div></div>
            <div><div style={{ fontWeight: 800 }}>{stats?.rating?.toFixed?.(1) ?? stats?.rating ?? '-'}</div><div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Rating</div></div>
          </div>
        </div>

        <h2 style={{ fontWeight: 800, fontSize: '1.15rem', margin: '24px 0 12px' }}>Payment history</h2>
        {!appts ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : paid.length === 0 ? (
          <div className="empty card card-pad"><h3>No received payments yet</h3><p className="mt-1">Completed, paid appointments will appear here.</p></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Booking</th><th>When</th><th>Customer</th><th>Method</th><th>Status</th><th>Amount</th></tr></thead>
              <tbody>
                {paid.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.bookingRef}</strong></td>
                    <td>{a.date} {'\u00b7'} {formatTime(a.startTime)}</td>
                    <td>{a.customerName}</td>
                    <td><StatusBadge status={a.payment?.method} /></td>
                    <td><StatusBadge status={a.payment?.status || a.status} /></td>
                    <td><strong>{formatMoney(a.finalAmount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}