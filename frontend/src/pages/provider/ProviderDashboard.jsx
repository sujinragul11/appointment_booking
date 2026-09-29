import { Link } from 'react-router-dom';
import Loader from '../../components/Loader';
import { availabilityApi, providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { formatMoney } from '../../utils/format';
import { ProviderShell, PageHead, ErrorState, EmptyState, SectionLoading, TimezoneNote } from './components/Shell';
import StatTile, { StatRow } from './components/StatTile';
import AppointmentItem from './components/AppointmentItem';
import useLoad from './lib/useLoad';
import { fmtDate, todayInZone, toMinutes } from './lib/time';

const byStart = (a, b) => String(a.date).localeCompare(String(b.date)) || toMinutes(a.startTime) - toMinutes(b.startTime);

/** Provider account status banner (PENDING / REJECTED / SUSPENDED) with the admin's note. */
export function ProviderStatusBanner({ status, note }) {
  const { t } = useI18n();
  if (!status || status === 'VERIFIED') return null;
  return (
    <div className={`pp-banner pp-banner-${status}`}>
      <span className="pp-banner-ico" aria-hidden="true">{status === 'PENDING' ? '◔' : '!'}</span>
      <div>
        <h2 className="pp-banner-title">{t(`provider.banner.${status}.title`)}</h2>
        <p>{t(`provider.banner.${status}.text`)}</p>
        {note ? <p className="pp-banner-note"><strong>{t('provider.banner.note')}</strong> {note}</p> : null}
      </div>
    </div>
  );
}

function SetupChecklist({ me }) {
  const { t } = useI18n();
  const hoursQ = useLoad(() => availabilityApi.mine(), []);
  const hasHours = (hoursQ.data?.availability || []).some((w) => w.active !== false);
  const steps = [
    { key: 'services', done: (me.services || []).some((s) => s.active), to: '/dashboard/provider/services' },
    { key: 'hours', done: hasHours, to: '/dashboard/provider/availability' },
    { key: 'profile', done: Boolean(me.description && me.address && me.phone), to: '/dashboard/provider/settings' },
    { key: 'team', done: (me.staff || []).length > 0, to: '/dashboard/provider/staff' }
  ];
  return (
    <section className="card card-pad pp-section" aria-labelledby="setup-title">
      <h2 className="pp-h2" id="setup-title">{t('provider.dashboard.setupTitle')}</h2>
      <p className="pp-muted">{t('provider.dashboard.setupText')}</p>
      <ol className="pp-checklist">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? 'done' : ''}>
            <span className="pp-check" aria-hidden="true">{s.done ? '✓' : '○'}</span>
            <Link to={s.to}>{t(`provider.dashboard.setup.${s.key}`)}</Link>
            {s.done && <span className="sr-only"> ({t('provider.dashboard.setupDone')})</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function ProviderDashboard() {
  const { t, locale } = useI18n();
  const meQ = useLoad(() => providerApi.me(), []);
  const statsQ = useLoad(() => providerApi.stats(), []);
  const me = meQ.data;
  const ready = Boolean(me) || Boolean(meQ.error);
  const today = todayInZone(me?.timezone);
  const dayQ = useLoad(() => (ready ? providerApi.day(today) : Promise.resolve(null)), [today, ready]);
  const pendingQ = useLoad(() => providerApi.appointments({ status: 'PENDING', size: 50 }), []);

  if (meQ.loading && !me) return <ProviderShell><Loader label={t('provider.common.loading')} /></ProviderShell>;

  const onUpdated = (updated) => {
    dayQ.setData((list) => (list || []).map((a) => (a.id === updated.id ? updated : a)));
    pendingQ.setData((page) => page && ({
      ...page,
      content: page.content.map((a) => (a.id === updated.id ? updated : a)).filter((a) => a.status === 'PENDING' || a.id === updated.id)
    }));
    statsQ.reload();
  };

  const stats = statsQ.data;
  const pending = [...(pendingQ.data?.content || [])].sort(byStart);
  const todayList = [...(dayQ.data || [])].sort(byStart);
  const n = (v) => Number(v || 0).toLocaleString(locale);

  return (
    <ProviderShell>
      <PageHead
        title={me?.businessName || t('provider.dashboard.title')}
        lead={me ? [me.specialty, me.city].filter(Boolean).join(' · ') : null}
        actions={<Link to="/dashboard/provider/appointments" className="btn btn-primary btn-sm">{t('provider.dashboard.openSchedule')}</Link>}
      />
      {meQ.error && <ErrorState error={meQ.error} onRetry={meQ.reload} />}
      {me && <ProviderStatusBanner status={me.status} note={me.adminNote} />}
      {me && me.status === 'PENDING' && <SetupChecklist me={me} />}

      <section aria-labelledby="stats-title" className="pp-section">
        <h2 className="sr-only" id="stats-title">{t('provider.dashboard.statsTitle')}</h2>
        {statsQ.error && !stats ? <ErrorState error={statsQ.error} onRetry={statsQ.reload} /> : !stats ? <SectionLoading /> : (
          <StatRow label={t('provider.dashboard.statsTitle')}>
            <StatTile label={t('provider.dashboard.stats.today')} value={n(stats.todayAppointments)} />
            <StatTile label={t('provider.dashboard.stats.upcoming')} value={n(stats.upcomingAppointments)} />
            <StatTile label={t('provider.dashboard.stats.pending')} value={n(stats.pendingAppointments)} tone={stats.pendingAppointments > 0 ? 'attention' : undefined} />
            <StatTile label={t('provider.dashboard.stats.completed')} value={n(stats.completedAppointments)} />
            <StatTile label={t('provider.dashboard.stats.cancelled')} value={n(stats.cancelledAppointments)} />
            <StatTile label={t('provider.dashboard.stats.noShow')} value={n(stats.noShowAppointments)} />
            <StatTile label={t('provider.dashboard.stats.monthRevenue')} value={formatMoney(stats.monthlyRevenue)} sub={t('provider.dashboard.stats.totalRevenue', { amount: formatMoney(stats.totalRevenue) })} />
            <StatTile label={t('provider.dashboard.stats.rating')} value={`${Number(stats.rating || 0).toFixed(1)} ★`}
              sub={t('provider.dashboard.stats.reviews', { count: n(stats.reviewCount) })} />
          </StatRow>
        )}
      </section>

      <div className="pp-cols">
        <section className="pp-section" aria-labelledby="today-title">
          <div className="pp-section-head">
            <h2 className="pp-h2" id="today-title">{t('provider.dashboard.todayTitle', { date: fmtDate(today, locale, { weekday: 'long', day: 'numeric', month: 'long' }) })}</h2>
            <Link to="/dashboard/provider/appointments" className="link-more">{t('provider.dashboard.weekView')}</Link>
          </div>
          <TimezoneNote timezone={me?.timezone} />
          {dayQ.error ? <ErrorState error={dayQ.error} onRetry={dayQ.reload} /> : (!ready || dayQ.loading) && !dayQ.data ? <SectionLoading /> : todayList.length === 0 ? (
            <EmptyState headingLevel={3} title={t('provider.dashboard.todayEmpty')} text={t('provider.dashboard.todayEmptyText')} />
          ) : (
            <ul className="pp-appt-list card">
              {todayList.map((a) => <AppointmentItem key={a.id} appt={a} onUpdated={onUpdated} allowCollect />)}
            </ul>
          )}
        </section>

        <section className="pp-section" aria-labelledby="pending-title">
          <div className="pp-section-head">
            <h2 className="pp-h2" id="pending-title">
              {t('provider.dashboard.needsAction')}
              {pendingQ.data ? <span className="pp-count"> ({n(pendingQ.data.totalElements)})</span> : null}
            </h2>
            <Link to="/dashboard/provider/appointments?view=list&status=PENDING" className="link-more">{t('provider.dashboard.viewAllPending')}</Link>
          </div>
          <p className="pp-muted pp-section-lead">{t('provider.dashboard.needsActionText')}</p>
          {pendingQ.error ? <ErrorState error={pendingQ.error} onRetry={pendingQ.reload} /> : !pendingQ.data ? <SectionLoading /> : pending.length === 0 ? (
            <EmptyState headingLevel={3} title={t('provider.dashboard.needsActionEmpty')} />
          ) : (
            <ul className="pp-appt-list card">
              {pending.slice(0, 8).map((a) => <AppointmentItem key={a.id} appt={a} onUpdated={onUpdated} allowCollect showDate />)}
            </ul>
          )}
        </section>
      </div>
    </ProviderShell>
  );
}
