import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { fetchReport, fetchStats } from '../../api/admin';
import { getErrorMessage } from '../../api/client';
import { addDaysISO, todayISO } from '../../utils/format';
import AdminLayout from './AdminLayout';
import { DataState, KpiGrid } from './adminUi';
import { useAdminFormat, useLoader, usePlural } from './adminHooks';
import { ColumnChart } from './charts/Charts';
import { dailySeries, peak } from './charts/reportData';

// The dashboard's trend always covers the 30 days up to today.
function last30Days() {
  const to = todayISO();
  return { from: addDaysISO(to, -29), to };
}

export default function AdminDashboard() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const stats = useLoader(fetchStats, 'stats');
  const [range] = useState(last30Days);
  const trend = useLoader(() => fetchReport(range), `${range.from}:${range.to}`);
  const s = stats.data;

  const queues = s ? [
    { key: 'providers', count: s.pendingProviders, label: t('admin.dashboard.pendingProviders'), action: t('admin.dashboard.review'), to: '/dashboard/admin/providers?status=PENDING' },
    { key: 'reviews', count: s.pendingReviews, label: t('admin.dashboard.pendingReviews'), action: t('admin.dashboard.moderate'), to: '/dashboard/admin/reviews?filter=PENDING' },
    { key: 'appointments', count: s.pendingAppointments, label: t('admin.dashboard.pendingAppointments'), action: t('admin.dashboard.view'), to: '/dashboard/admin/appointments?status=PENDING' }
  ] : [];

  const kpis = s ? [
    {
      key: 'users',
      label: t('admin.dashboard.users'),
      value: fmt.compactNumber(s.totalUsers),
      sub: t('admin.dashboard.usersSub', { customers: fmt.number(s.totalCustomers), providers: fmt.number(s.totalProviders) })
    },
    {
      key: 'providers',
      label: t('admin.dashboard.providers'),
      value: fmt.compactNumber(s.totalProviders),
      sub: <Link to="/dashboard/admin/providers?status=PENDING">{t('admin.dashboard.providersSub', { pending: fmt.number(s.pendingProviders) })}</Link>
    },
    {
      key: 'appointments',
      label: t('admin.dashboard.appointments'),
      value: fmt.compactNumber(s.totalAppointments),
      sub: t('admin.dashboard.appointmentsSub', {
        pending: fmt.number(s.pendingAppointments),
        confirmed: fmt.number(s.confirmedAppointments),
        completed: fmt.number(s.completedAppointments),
        cancelled: fmt.number(s.cancelledAppointments)
      })
    },
    { key: 'revenue', label: t('admin.dashboard.revenue'), value: fmt.compactMoney(s.totalRevenue), sub: t('admin.dashboard.revenueSub') },
    {
      key: 'reviews',
      label: t('admin.dashboard.reviews'),
      value: fmt.compactNumber(s.totalReviews),
      sub: <Link to="/dashboard/admin/reviews?filter=PENDING">{t('admin.dashboard.reviewsSub', { pending: fmt.number(s.pendingReviews) })}</Link>
    }
  ] : [];

  const report = trend.data;
  const daily = report ? dailySeries(report) : null;
  const totals = report?.totals;
  const busiest = daily ? peak(daily.dates.map((date, i) => ({ date, bookings: daily.bookings[i] })), 'bookings') : null;

  return (
    <AdminLayout title={t('admin.dashboard.title')} subtitle={t('admin.dashboard.subtitle')}>
      <DataState loading={stats.loading} error={stats.error} hasData={Boolean(s)} onRetry={stats.reload}>
        {s ? (
          <>
            <section className="admin-section" aria-labelledby="dash-queues">
              <h2 id="dash-queues" className="admin-h2">{t('admin.dashboard.attention')}</h2>
              <ul className="adm-queue-grid">
                {queues.map((q) => (
                  <li key={q.key} className={`adm-queue-card ${q.count > 0 ? 'has-items' : ''}`}>
                    <span className="adm-queue-count">{fmt.number(q.count)}</span>
                    <span className="adm-queue-label">{q.label}</span>
                    {q.count > 0
                      ? <Link className="btn btn-primary btn-sm" to={q.to} aria-label={`${q.action}: ${q.label}`}>{q.action}</Link>
                      : <span className="adm-queue-clear"><span aria-hidden="true">&#10003;</span> {t('admin.dashboard.allClear')}</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="admin-section" aria-labelledby="dash-kpis">
              <h2 id="dash-kpis" className="admin-h2">{t('admin.dashboard.kpis')}</h2>
              <KpiGrid items={kpis} />
            </section>
          </>
        ) : null}
      </DataState>

      <section className="admin-section card card-pad" aria-labelledby="dash-trend" aria-busy={trend.loading || undefined}>
        <div className="admin-section-head">
          <h2 id="dash-trend" className="admin-h2">{t('admin.dashboard.last30')}</h2>
          <Link to="/dashboard/admin/reports" className="link-more">{t('admin.dashboard.openReports')} <span aria-hidden="true">&rarr;</span></Link>
        </div>
        {trend.error && !report ? (
          <div role="alert" className="admin-inline-error">
            <p>{getErrorMessage(trend.error, t('admin.dashboard.trendError'))}</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={trend.reload}>{t('admin.common.retry')}</button>
          </div>
        ) : !report ? (
          <p className="muted-line" role="status"><span className="spinner dark" aria-hidden="true" /> {t('admin.common.loading')}</p>
        ) : (
          <>
            <KpiGrid items={[
              { key: 'bookings', label: t('admin.dashboard.bookings'), value: fmt.compactNumber(totals?.bookings) },
              { key: 'revenue', label: t('admin.dashboard.revenue'), value: fmt.compactMoney(totals?.revenue) },
              { key: 'cancelled', label: t('admin.dashboard.cancellationRate'), value: fmt.percent(totals?.cancellationRate) }
            ]} />
            <ColumnChart
              id="dash-trend-chart"
              integer
              spreadTicks
              height={180}
              title={t('admin.dashboard.trendTitle')}
              summary={totals?.bookings
                ? [
                  t('admin.dashboard.trendSummary', {
                    bookings: plural('admin.common.bookings', totals.bookings), revenue: fmt.money(totals.revenue),
                    from: fmt.date(report.from), to: fmt.date(report.to)
                  }),
                  busiest ? t('admin.reports.busiestDay', { day: fmt.longDay(busiest.date), bookings: plural('admin.common.bookings', busiest.bookings) }) : ''
                ].join(' ').trim()
                : t('admin.dashboard.trendEmpty')}
              labels={daily.dates}
              series={[{ key: 'bookings', label: t('admin.dashboard.bookings'), values: daily.bookings, tone: 1 }]}
              formatLabel={fmt.dayMonth}
              formatLongLabel={fmt.longDay}
              formatValue={fmt.number}
              labelHeader={t('admin.dashboard.date')}
            />
          </>
        )}
      </section>
    </AdminLayout>
  );
}
