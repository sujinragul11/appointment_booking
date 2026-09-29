import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import StatusBadge, { useStatusLabel } from '../../components/StatusBadge';
import { formatMoney, formatTime } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

const FILTERS = ['', 'CONFIRMED', 'PENDING', 'RESCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
// RESCHEDULED bookings are live bookings too: same actions as CONFIRMED.
const LIVE = ['CONFIRMED', 'RESCHEDULED'];

// The backend reports todayAppointments/upcomingAppointments/...; older builds used today/upcoming/...
export function normalizeStats(s = {}) {
  const pick = (...keys) => Number(keys.map((k) => s?.[k]).find((v) => v !== undefined && v !== null) ?? 0) || 0;
  return {
    today: pick('todayAppointments', 'today'),
    upcoming: pick('upcomingAppointments', 'upcoming'),
    completed: pick('completedAppointments', 'completed'),
    cancelled: pick('cancelledAppointments', 'cancelled')
  };
}

export default function ProviderAppointments() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('');
  const [stats, setStats] = useState(() => normalizeStats());
  const toast = useToast();
  const statusLabel = useStatusLabel();

  const load = () => api.get('/appointments/provider').then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => {
    load();
    api.get('/provider/stats').then((r) => setStats(normalizeStats(r.data))).catch(() => {});
  }, []);

  const setStatus = async (a, status) => {
    try {
      const { data } = await api.put(`/appointments/${a.id}/status`, { status });
      setItems((p) => (p || []).map((x) => (x.id === data.id ? data : x)));
      toast(`${a.bookingRef} marked ${statusLabel(status)}`, 'success');
    } catch (e) { toast(getErrorMessage(e), 'error'); }
  };

  const filtered = items?.filter((a) => !filter || a.status === filter) || [];

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/provider">Overview</Link>
          <Link to="/dashboard/provider/appointments" className="active">Appointments</Link>
          <Link to="/dashboard/provider/services">Services</Link>
          <Link to="/dashboard/provider/staff">Team</Link>
          <Link to="/dashboard/provider/availability">Availability</Link>
          <Link to="/dashboard/provider/earnings">Earnings</Link>
          <Link to="/dashboard/provider/settings">Settings</Link>
        </nav>
      </aside>

      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Appointments</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Accept, manage and mark appointments</p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="stat-card"><span className="stat-value">{stats.today}</span><span className="stat-label">Today</span></div>
          <div className="stat-card"><span className="stat-value">{stats.upcoming}</span><span className="stat-label">Upcoming</span></div>
          <div className="stat-card"><span className="stat-value">{stats.completed}</span><span className="stat-label">Completed</span></div>
          <div className="stat-card"><span className="stat-value">{stats.cancelled}</span><span className="stat-label">Cancelled</span></div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }} role="group" aria-label="Filter by status">
          {FILTERS.map((s) => (
            <button key={s || 'all'} type="button" className={`chip ${filter === s ? 'active' : ''}`} aria-pressed={filter === s}
              onClick={() => setFilter(s)}>{s ? statusLabel(s) : 'All'}</button>
          ))}
        </div>

        {!items ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="empty card card-pad"><h2 style={{ fontSize: '1.15rem' }}>No appointments {filter && `with status ${statusLabel(filter)}`}</h2><p className="mt-1">Bookings will appear here.</p></div>
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr><th>Customer</th><th>Service</th><th>When</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.customerName}</strong><div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{a.bookingRef}</div></td>
                    <td>{a.serviceName}{a.staffName ? ` \u00b7 ${a.staffName}` : ''}</td>
                    <td>{a.date} {'\u00b7'} {formatTime(a.startTime)}</td>
                    <td>{formatMoney(a.finalAmount)}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 190 }}>
                        {LIVE.includes(a.status) && <button type="button" className="btn btn-primary btn-xs" onClick={() => setStatus(a, 'IN_PROGRESS')}>Start</button>}
                        {a.status === 'IN_PROGRESS' && <button type="button" className="btn btn-success btn-xs" onClick={() => setStatus(a, 'COMPLETED')}>Complete</button>}
                        {LIVE.includes(a.status) && <button type="button" className="btn btn-danger btn-xs" onClick={() => setStatus(a, 'NO_SHOW')}>No-show</button>}
                        {['PENDING', ...LIVE].includes(a.status) && <button type="button" className="btn btn-outline btn-xs" onClick={() => setStatus(a, 'CANCELLED')}>Cancel</button>}
                      </div>
                    </td>
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