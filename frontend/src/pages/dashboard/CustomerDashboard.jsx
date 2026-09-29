import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import AccountNav from '../../components/AccountNav';
import { useT } from '../../i18n';
import { formatDateTime, formatMoney, todayISO } from '../../utils/format';

const TABS = ['upcoming', 'past', 'cancelled'];
const FINISHED = ['COMPLETED', 'NO_SHOW'];

/**
 * FR-27: cancelled = CANCELLED; past = COMPLETED/NO_SHOW or dated before today;
 * upcoming = everything else dated today or later (PENDING, CONFIRMED, RESCHEDULED and
 * IN_PROGRESS), so every booking lands in exactly one tab.
 */
export function bookingTab(appt, today = todayISO()) {
  if (appt.status === 'CANCELLED') return 'cancelled';
  if (FINISHED.includes(appt.status) || String(appt.date) < today) return 'past';
  return 'upcoming';
}

const when = (a) => `${a.date}T${String(a.startTime || '00:00')}`;

export default function CustomerDashboard() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'upcoming';
  const [appts, setAppts] = useState(null);
  const [error, setError] = useState(false);
  const tabRefs = useRef({});

  const load = () => {
    setError(false);
    api.get('/appointments/my')
      .then((r) => setAppts(Array.isArray(r.data) ? r.data : []))
      .catch(() => { setAppts([]); setError(true); });
  };
  useEffect(load, []);

  const today = todayISO();
  const groups = { upcoming: [], past: [], cancelled: [] };
  (appts || []).forEach((a) => groups[bookingTab(a, today)].push(a));
  groups.upcoming.sort((a, b) => when(a).localeCompare(when(b))); // soonest first
  groups.past.sort((a, b) => when(b).localeCompare(when(a))); // most recent first
  groups.cancelled.sort((a, b) => when(b).localeCompare(when(a)));
  const list = groups[tab];

  const selectTab = (next) => setParams(next === 'upcoming' ? {} : { tab: next }, { replace: true });

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e) => {
    const i = TABS.indexOf(tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    if (e.key === 'ArrowLeft') next = TABS[(i + TABS.length - 1) % TABS.length];
    if (e.key === 'Home') next = TABS[0];
    if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next);
    tabRefs.current[next]?.focus();
  };

  const emptyText = {
    upcoming: 'No upcoming appointments.',
    past: 'No past appointments yet.',
    cancelled: 'No cancelled appointments.'
  };

  return (
    <div className="dash">
      <AccountNav />

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>My bookings</h1>
            <p>All your appointments in one place</p>
          </div>
          <Link to="/providers" className="btn btn-primary btn-sm">Book new</Link>
        </div>

        <div className="tabs" role="tablist" aria-label={t('bookings.tabs')} onKeyDown={onTabKey}>
          {TABS.map((key) => (
            <button key={key} ref={(el) => { tabRefs.current[key] = el; }} type="button" role="tab" id={`tab-${key}`}
              aria-selected={tab === key} aria-controls="bookings-panel" tabIndex={tab === key ? 0 : -1}
              className={`chip ${tab === key ? 'active' : ''}`} onClick={() => selectTab(key)}>
              {t(`bookings.${key}`)}{appts ? ` (${groups[key].length})` : ''}
            </button>
          ))}
        </div>

        <div id="bookings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {!appts ? (
            <p style={{ color: 'var(--muted)' }}>Loading...</p>
          ) : error ? (
            <div className="form-error" role="alert">
              Could not load your bookings.{' '}
              <button type="button" className="btn btn-outline btn-xs" onClick={load}>Try again</button>
            </div>
          ) : list.length === 0 ? (
            <div className="empty card card-pad">
              <div className="empty-ico" aria-hidden="true">{'\u{1F4C5}'}</div>
              <h2 style={{ fontSize: '1.15rem' }}>{emptyText[tab]}</h2>
              <p className="mt-1">When you book, your appointments will show up here.</p>
              <Link className="btn btn-primary mt-3" to="/providers">Browse providers</Link>
            </div>
          ) : (
            <ul className="card plain-list">
              {list.map((a) => (
                <li key={a.id}>
                  <Link to={`/appointments/${a.id}`} className="list-item card-hover appt-row">
                    <div className="avatar" style={{ width: 44, height: 44, background: 'var(--gradient-soft)', color: 'var(--brand-700)' }} aria-hidden="true">{'\u{1F4C5}'}</div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700 }}>{a.serviceName}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{a.providerName} {'•'} {a.bookingRef}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{formatDateTime(`${a.date}T${a.startTime}`)}</div>
                    </div>
                    <StatusBadge status={a.status} />
                    <strong style={{ minWidth: 70, textAlign: 'right' }}>{formatMoney(a.finalAmount)}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
