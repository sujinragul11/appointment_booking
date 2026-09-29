import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import { formatDateTime, formatMoney } from '../../utils/format';

export default function CustomerDashboard() {
  const [appts, setAppts] = useState(null);
  const [filter, setFilter] = useState('');

  const load = () => {
    api.get('/appointments/my').then((r) => setAppts(r.data)).catch(() => setAppts([]));
  };
  useEffect(load, []);

  const filtered = appts?.filter((a) => !filter || a.status === filter) || [];

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard" className="active">My bookings</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/addresses">Addresses</Link>
          <Link to="/notifications">Notifications</Link>
          <Link to="/providers">Find providers</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>My bookings</h1>
            <p>All your appointments in one place</p>
          </div>
          <Link to="/providers" className="btn btn-primary btn-sm">Book new</Link>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {['', 'UPCOMING', 'CONFIRMED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => (
            <button key={s || 'all'} className={`chip ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}>{s || 'Recent'}</button>
          ))}
        </div>

        {!appts ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="empty card card-pad">
            <div className="empty-ico">{'\u{1F4C5}'}</div>
            <h3>No appointments {filter && `with status ${filter}`}</h3>
            <p className="mt-1">When you book, your appointments will show up here.</p>
            <Link className="btn btn-primary mt-3" to="/providers">Browse providers</Link>
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((a) => (
              <Link key={a.id} to={`/appointments/${a.id}`} className="list-item card-hover" style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid #f1f5f9' }}>
                <div className="avatar" style={{ width: 44, height: 44, background: 'var(--gradient-soft)', color: 'var(--brand-700)' }}>{'\u{1F4C5}'}</div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{a.serviceName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{a.providerName} {'\u2022'} {a.bookingRef}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{formatDateTime(a.date + 'T' + a.startTime)}</div>
                </div>
                <StatusBadge status={a.status} />
                <strong style={{ minWidth: 70, textAlign: 'right' }}>{formatMoney(a.finalAmount)}</strong>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}