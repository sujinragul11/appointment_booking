import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import { formatMoney, formatTime } from '../../utils/format';

export default function ProviderDashboard() {
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    api.get('/provider/stats').then((r) => setStats(r.data)).catch(() => {});
    api.get('/provider/me').then((r) => setMe(r.data)).catch(() => {});
    api.get('/appointments/provider/today', { params: { date: new Date().toISOString().slice(0, 10) } })
      .then((r) => setToday(r.data)).catch(() => {});
  }, []);

  const cards = stats ? [
    { label: 'Today\u2019s bookings', value: stats.todayAppointments, icon: '\u{1F4C5}' },
    { label: 'Upcoming', value: stats.upcomingAppointments, icon: '\u23F0' },
    { label: 'Completed', value: stats.completedAppointments, icon: '\u2705' },
    { label: 'Cancelled', value: stats.cancelledAppointments, icon: '\u274C' },
  ] : [];

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/provider" className="active">Overview</Link>
          <Link to="/dashboard/provider/appointments">Appointments</Link>
          <Link to="/dashboard/provider/services">Services</Link>
          <Link to="/dashboard/provider/staff">Team</Link>
          <Link to="/dashboard/provider/availability">Availability</Link>
          <Link to="/dashboard/provider/earnings">Earnings</Link>
          <Link to="/dashboard/provider/settings">Settings</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {me ? me.businessName : 'Provider dashboard'}
            </h1>
            <p>{me ? `${me.city || ''} \u2022 ${me.services?.length || 0} services \u2022 ` : ''}
              {stats ? `${stats.rating.toFixed(1)} \u2605 (${stats.reviewCount})` : ''}</p>
          </div>
          <span className="badge badge-success" style={{ alignSelf: 'flex-start' }}>{me?.status}</span>
        </div>

        <div className="stat-cards">
          {cards.map((c) => (
            <div key={c.label} className="stat-card">
              <span className="stat-ico">{c.icon}</span>
              <span className="stat-value">{c.value}</span>
              <span className="stat-label">{c.label}</span>
            </div>
          ))}
        </div>

        <div className="card mt-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800 }}>Monthly revenue</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Appointments completed this month</div>
          </div>
          <strong className="grad-text" style={{ fontSize: '2rem' }}>{formatMoney(stats?.monthlyRevenue || 0)}</strong>
        </div>

        <h2 style={{ fontWeight: 800, fontSize: '1.2rem', margin: '24px 0 12px' }}>Today{'\u2019'}s schedule</h2>
        {!today ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : today.length === 0 ? (
          <div className="empty card card-pad"><h3>No bookings today</h3><p className="mt-1">Enjoy the calm before the storm!</p></div>
        ) : (
          <div className="card">
            {today.map((a) => (
              <Link key={a.id} to="/dashboard/provider/appointments" className="list-item card-hover" style={{ cursor: 'pointer' }}>
                <div className="avatar" style={{ width: 40, height: 40, background: 'var(--gradient-soft)', color: 'var(--brand-700)' }}>{a.customerName?.charAt(0)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{a.customerName} {'\u2013'} {a.serviceName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{formatTime(a.startTime)} - {formatTime(a.endTime)} {a.staffName ? ` \u2022 ${a.staffName}` : ''}</div>
                </div>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}