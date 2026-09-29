import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { formatMoney } from '../../utils/format';

export default function AdminDashboard() {
  const [s, setS] = useState(null);

  useEffect(() => { api.get('/admin/stats').then((r) => setS(r.data)).catch(() => {}); }, []);

  const cards = s ? [
    { label: 'Users', value: s.totalUsers, sub: `${s.totalCustomers} customers`, icon: '\u{1F465}' },
    { label: 'Providers', value: s.totalProviders, sub: `${s.pendingProviders} pending review`, icon: '\u{1F3E2}' },
    { label: 'Appointments', value: s.totalAppointments, sub: `${s.pendingAppointments} pending`, icon: '\u{1F4C5}' },
    { label: 'Slots', value: s.totalSlots, sub: `rated x ${s.totalReviews}`, icon: '\u23F0' },
  ] : [];

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/admin" className="active">Overview</Link>
          <Link to="/dashboard/admin/providers">Providers</Link>
          <Link to="/dashboard/admin/users">Users</Link>
          <Link to="/dashboard/admin/coupons">Coupons</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Platform overview</h1>
            <p>Everything happening on Sloto</p>
          </div>
        </div>

        {!s ? (
          <div className="stat-cards">{cards.map((c, i) => <div key={i} className="stat-card" style={{ opacity: 0.4 }}>... </div>)}</div>
        ) : (
          <>
            <div className="stat-cards">
              {cards.map((c) => (
                <div key={c.label} className="stat-card">
                  <span className="stat-ico">{c.icon}</span>
                  <span className="stat-value">{c.value}</span>
                  <span className="stat-label">{c.label}</span>
                  <span className="stat-sub" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{c.sub}</span>
                </div>
              ))}
            </div>

            <div className="card card-pad mt-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800 }}>Total revenue</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Across all completed &amp; paid appointments</div>
              </div>
              <strong className="grad-text" style={{ fontSize: '2.2rem' }}>{formatMoney(s.totalRevenue)}</strong>
            </div>

            {s.pendingProviders > 0 && (
              <div className="card card-pad mt-3" style={{ borderLeft: '3px solid #f59e0b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{s.pendingProviders} provider{s.pendingProviders === 1 ? '' : 's'} awaiting approval</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Review their application to activate them on the marketplace.</div>
                  </div>
                  <Link className="btn btn-primary btn-sm" to="/dashboard/admin/providers">Review</Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}