import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import ModeBadge from '../../components/ModeBadge';
import AccountNav from '../../components/AccountNav';
import { InlineLoader } from '../../components/Loader';
import { useI18n } from '../../i18n';
import { formatMoney, isValidTimeZone, todayISO } from '../../utils/format';
import { formatWhen, viewerClock } from '../../utils/bookingCalendar';

const TABS = ['upcoming', 'past', 'cancelled'];
const FINISHED = ['COMPLETED', 'NO_SHOW'];

/**
 * Client-side estimate of the tab a booking belongs in. The dashboard itself uses the
 * server's scopes (GET /appointments/my?scope=...); this remains for quick grouping elsewhere.
 */
export function bookingTab(appt, today = todayISO()) {
  if (appt.status === 'CANCELLED') return 'cancelled';
  if (FINISHED.includes(appt.status) || String(appt.date) < today) return 'past';
  return 'upcoming';
}

function AppointmentCard({ a }) {
  const { t, locale } = useI18n();
  const tz = isValidTimeZone(a.timezone) ? a.timezone : null;
  const local = viewerClock(a.startAt, tz, locale);
  const payment = a.paymentStatus || a.payment?.status;
  return (
    <Link to={`/appointments/${a.id}`} className="appt-card card-hover">
      <div className="appt-card-main">
        <h2 className="appt-card-title">{a.serviceName}</h2>
        <p className="appt-card-sub">{a.providerName}{a.staffName ? ` · ${a.staffName}` : ''}</p>
        <p className="appt-card-when">{formatWhen(a, locale)}</p>
        {local && <p className="tz-note">{t('site.slots.yourTime', { time: local })}</p>}
        <p className="appt-card-ref">{t('site.appointment.refShort', { ref: a.bookingRef })}</p>
      </div>
      <div className="appt-card-side">
        <StatusBadge status={a.status} />
        {payment && <span className="badge-line">{t('site.appointment.paymentShort')}: <StatusBadge status={payment} /></span>}
        <ModeBadge mode={a.mode} />
        <strong className="appt-card-amount">{formatMoney(a.finalAmount)}</strong>
        {a.actions?.canPay && <span className="badge badge-amber">{t('site.dashboard.payPending')}</span>}
        {a.actions?.canReview && <span className="badge badge-primary">{t('site.dashboard.reviewPending')}</span>}
      </div>
    </Link>
  );
}

/** FR-27: the customer's bookings, split by the server into upcoming / past / cancelled. */
export default function CustomerDashboard() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'upcoming';
  const [lists, setLists] = useState(null);
  const [error, setError] = useState('');
  const tabRefs = useRef({});

  const load = useCallback(() => {
    setError('');
    Promise.all(TABS.map((scope) => api.get('/appointments/my', { params: { scope } })
      .then((r) => [scope, Array.isArray(r.data) ? r.data : []])))
      .then((entries) => {
        const byScope = Object.fromEntries(entries);
        // Upcoming soonest first; past and cancelled most recent first (the server sends newest first).
        byScope.upcoming = [...byScope.upcoming].reverse();
        setLists(byScope);
      })
      .catch((e) => { setLists((prev) => prev || { upcoming: [], past: [], cancelled: [] }); setError(getErrorMessage(e, t('site.dashboard.loadFailed'))); });
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const list = lists?.[tab] || [];
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

  return (
    <div className="dash">
      <AccountNav />

      <div className="dash-main">
        <div className="section-title">
          <div>
            <h1 className="dash-title">{t('site.dashboard.title')}</h1>
            <p>{t('site.dashboard.lead')}</p>
          </div>
          <Link to="/services" className="btn btn-primary btn-sm">{t('site.dashboard.bookNew')}</Link>
        </div>

        <div className="tabs" role="tablist" aria-label={t('bookings.tabs')} onKeyDown={onTabKey}>
          {TABS.map((key) => (
            <button key={key} ref={(el) => { tabRefs.current[key] = el; }} type="button" role="tab" id={`tab-${key}`}
              aria-selected={tab === key} aria-controls="bookings-panel" tabIndex={tab === key ? 0 : -1}
              className={`chip ${tab === key ? 'active' : ''}`} onClick={() => selectTab(key)}>
              {t(`bookings.${key}`)}{lists ? ` (${lists[key].length})` : ''}
            </button>
          ))}
        </div>

        <div id="bookings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {error && (
            <div className="form-error" role="alert">
              {error}{' '}
              <button type="button" className="btn btn-outline btn-xs" onClick={load}>{t('common.retry')}</button>
            </div>
          )}
          {!lists ? (
            <p className="muted-line" role="status"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
          ) : list.length === 0 ? (
            !error && (
              <div className="empty card card-pad">
                <div className="empty-ico" aria-hidden="true">{'\u{1F4C5}'}</div>
                <h2 className="empty-title">{t(`site.dashboard.empty.${tab}`)}</h2>
                <p className="mt-1">{t('site.dashboard.emptyText')}</p>
                <Link className="btn btn-primary mt-3" to="/providers">{t('site.nav.providers')}</Link>
              </div>
            )
          ) : (
            <ul className="appt-list plain-list">
              {list.map((a) => <li key={a.id}><AppointmentCard a={a} /></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
