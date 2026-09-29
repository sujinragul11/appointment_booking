import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { exportReport, fetchReport } from '../../api/admin';
import { addDaysISO, parseISODate, todayISO } from '../../utils/format';
import AdminLayout from './AdminLayout';
import ProviderPicker from './ProviderPicker';
import { DataState, ExportButtons, FilterDate, FilterSelect, KpiGrid, TableWrap } from './adminUi';
import { useAdminFormat, useLoader, usePlural, useUrlFilters } from './adminHooks';
import { ColumnChart, HBarList } from './charts/Charts';
import { dailySeries, hourSeries, peak, statusShares, timeBuckets, weekdaySeries } from './charts/reportData';

const DEFAULTS = { preset: 'last30', from: '', to: '', providerId: '', providerName: '' };
// [first day, last day] relative to today
export const PRESETS = { last7: [-6, 0], last30: [-29, 0], last90: [-89, 0], next30: [0, 29] };
export const MAX_RANGE_DAYS = 366;

/** The report period for the current filters: a preset relative to `today`, or the custom dates. */
export function reportRange(filters, today = todayISO()) {
  const preset = PRESETS[filters.preset];
  if (preset && filters.preset !== 'custom') {
    return { from: addDaysISO(today, preset[0]), to: addDaysISO(today, preset[1]) };
  }
  return { from: filters.from || '', to: filters.to || '' };
}

/** 'missing' | 'order' | 'tooLong' | null */
export function rangeProblem({ from, to }) {
  const start = parseISODate(from);
  const end = parseISODate(to);
  if (!start || !end) return 'missing';
  if (start > end) return 'order';
  const days = Math.round((end - start) / 86400000);
  return days > MAX_RANGE_DAYS ? 'tooLong' : null;
}

/** Reports (FR-46, FR-47): bookings, revenue, cancellations, peak hours for a period (+ provider), with CSV / PDF export. */
export default function AdminReports() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const range = reportRange(filters);
  const problem = rangeProblem(range);
  const params = { from: range.from, to: range.to, providerId: filters.providerId };
  const report = useLoader(() => (problem ? Promise.resolve(null) : fetchReport(params)), problem ? `invalid:${problem}` : JSON.stringify(params));
  const data = report.data;

  const setDate = (key, value) => setFilters({ preset: 'custom', from: range.from, to: range.to, [key]: value });
  const bookings = (n) => plural('admin.common.bookings', n);

  const problemText = problem === 'order' ? t('admin.common.rangeInvalid')
    : problem === 'tooLong' ? t('admin.reports.rangeTooLong')
      : problem === 'missing' ? t('admin.reports.rangeMissing') : '';

  return (
    <AdminLayout
      title={t('admin.reports.title')}
      subtitle={t('admin.reports.subtitle')}
      actions={<ExportButtons label={t('admin.reports.exportLabel')} disabled={Boolean(problem)} onExport={(format) => exportReport(format, params)} />}
    >
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <FilterSelect label={t('admin.reports.period')} value={PRESETS[filters.preset] ? filters.preset : 'custom'}
          onChange={(preset) => (preset === 'custom'
            ? setFilters({ preset, from: range.from, to: range.to })
            : setFilters({ preset, from: '', to: '' }))}
          options={[...Object.keys(PRESETS), 'custom'].map((key) => ({ value: key, label: t(`admin.reports.preset.${key}`) }))} />
        <FilterDate label={t('admin.common.from')} value={range.from} onChange={(v) => setDate('from', v)}
          invalid={Boolean(problem)} describedBy={problem ? 'report-range-error' : undefined} />
        <FilterDate label={t('admin.common.to')} value={range.to} onChange={(v) => setDate('to', v)}
          invalid={Boolean(problem)} describedBy={problem ? 'report-range-error' : undefined} />
        <ProviderPicker className="admin-filter" label={t('admin.reports.provider')} placeholder={t('admin.common.allProviders')}
          value={filters.providerId ? { id: Number(filters.providerId), name: filters.providerName } : null}
          onChange={(p) => setFilters({ providerId: p ? String(p.id) : '', providerName: p ? p.name : '' })} />
      </div>
      <p className="hint admin-export-hint">{t('admin.reports.exportHint')}</p>
      {problem ? <p id="report-range-error" className="form-error" role="alert">{problemText}</p> : null}

      {!problem ? (
        <DataState loading={report.loading} error={report.error} hasData={Boolean(data)} onRetry={report.reload}>
          {data ? (
            <div className={`adm-report-body ${report.loading ? 'adm-refreshing' : ''}`} aria-busy={report.loading || undefined}>
              <ReportContent report={data} fmt={fmt} t={t} bookings={bookings} providerName={filters.providerName} />
            </div>
          ) : null}
        </DataState>
      ) : null}
    </AdminLayout>
  );
}

function ReportContent({ report, fmt, t, bookings, providerName }) {
  const totals = report.totals || {};
  const daily = dailySeries(report);
  const days = daily.dates.map((date, i) => ({ date, bookings: daily.bookings[i], revenue: daily.revenue[i] }));
  const buckets = timeBuckets(report);
  const weekly = buckets.unit === 'week';
  const periods = buckets.rows.map((r) => r.start);
  const periodEnd = new Map(buckets.rows.map((r) => [r.start, r.end]));
  const periodLabel = (start) => (weekly
    ? t('admin.reports.weekRange', { from: fmt.date(start), to: fmt.date(periodEnd.get(start)) })
    : fmt.longDay(start));
  const busiestDay = peak(days, 'bookings');
  const bestRevenueDay = peak(days, 'revenue');
  const hours = hourSeries(report.byHour);
  const busiestHour = peak(hours, 'bookings');
  const weekdays = weekdaySeries(report.byWeekday);
  const busiestWeekday = peak(weekdays, 'bookings');
  const statuses = statusShares(report.byStatus);
  const hourRange = (h) => t('admin.reports.hourRange', { from: fmt.hour(h), to: fmt.hour((h + 1) % 24) });

  const kpis = [
    { key: 'bookings', label: t('admin.reports.bookings'), value: fmt.compactNumber(totals.bookings) },
    { key: 'completed', label: t('admin.reports.completed'), value: fmt.compactNumber(totals.completed) },
    { key: 'cancelled', label: t('admin.reports.cancelled'), value: fmt.compactNumber(totals.cancelled), sub: t('admin.reports.cancelledSub', { rate: fmt.percent(totals.cancellationRate) }) },
    { key: 'noShows', label: t('admin.reports.noShows'), value: fmt.compactNumber(totals.noShows), sub: t('admin.reports.noShowsSub', { rate: fmt.percent(totals.noShowRate) }) },
    { key: 'upcoming', label: t('admin.reports.upcoming'), value: fmt.compactNumber(totals.upcoming), sub: t('admin.reports.upcomingSub') },
    { key: 'revenue', label: t('admin.reports.revenue'), value: fmt.compactMoney(totals.revenue), sub: t('admin.reports.revenueSub') },
    { key: 'refunds', label: t('admin.reports.refunds'), value: fmt.compactMoney(totals.refunds) },
    { key: 'average', label: t('admin.reports.avgValue'), value: fmt.money(totals.averageBookingValue), sub: t('admin.reports.avgValueSub') }
  ];

  const appointmentsLink = (p) => `/dashboard/admin/appointments?${new URLSearchParams({
    providerId: String(p.id), providerName: p.name, from: report.from, to: report.to
  })}`;

  return (
    <>
      <p className="adm-report-range">
        {t('admin.reports.showing', { from: fmt.date(report.from), to: fmt.date(report.to) })}
        {providerName ? ` · ${providerName}` : ''}
      </p>

      <section className="admin-section" aria-labelledby="report-kpis">
        <h2 id="report-kpis" className="admin-h2">{t('admin.reports.kpis')}</h2>
        <KpiGrid items={kpis} />
      </section>

      <section className="admin-section" aria-labelledby="report-trends">
        <h2 id="report-trends" className="admin-h2">{t('admin.reports.trends')}</h2>
        <div className="card card-pad adm-viz-card">
          <ColumnChart
            id="report-daily"
            integer
            spreadTicks
            title={weekly ? t('admin.reports.weeklyTitle') : t('admin.reports.dailyTitle')}
            summary={totals.bookings
              ? `${t('admin.reports.dailySummary', { bookings: bookings(totals.bookings), cancellations: fmt.number(totals.cancelled) })} ${busiestDay ? t('admin.reports.busiestDay', { day: fmt.longDay(busiestDay.date), bookings: bookings(busiestDay.bookings) }) : ''}`.trim()
              : t('admin.reports.dailyEmpty')}
            labels={periods}
            formatLabel={fmt.dayMonth}
            formatLongLabel={periodLabel}
            series={[
              { key: 'kept', label: t('admin.reports.seriesKept'), values: buckets.rows.map((r) => r.bookings - r.cancellations), tone: 1 },
              { key: 'cancelled', label: t('admin.reports.seriesCancellations'), values: buckets.rows.map((r) => r.cancellations), tone: 2 }
            ]}
            totalLabel={t('admin.reports.seriesBookings')}
            formatValue={fmt.number}
            labelHeader={weekly ? t('admin.reports.weekHeader') : t('admin.reports.dateHeader')}
          />
        </div>
        <div className="card card-pad adm-viz-card">
          <ColumnChart
            id="report-revenue"
            spreadTicks
            title={weekly ? t('admin.reports.revenueWeeklyTitle') : t('admin.reports.revenueTitle')}
            summary={totals.revenue > 0 && bestRevenueDay
              ? t('admin.reports.revenueSummary', { total: fmt.money(totals.revenue), day: fmt.longDay(bestRevenueDay.date), amount: fmt.money(bestRevenueDay.revenue) })
              : t('admin.reports.revenueEmpty')}
            labels={periods}
            formatLabel={fmt.dayMonth}
            formatLongLabel={periodLabel}
            series={[{ key: 'revenue', label: t('admin.reports.revenue'), values: buckets.rows.map((r) => r.revenue), tone: 1 }]}
            formatValue={fmt.money}
            formatTick={fmt.compactMoney}
            labelHeader={weekly ? t('admin.reports.weekHeader') : t('admin.reports.dateHeader')}
          />
        </div>
      </section>

      <section className="admin-section" aria-labelledby="report-patterns">
        <h2 id="report-patterns" className="admin-h2">{t('admin.reports.patterns')}</h2>
        <div className="adm-viz-grid">
          <div className="card card-pad adm-viz-card">
            <ColumnChart
              id="report-hours"
              integer
              title={t('admin.reports.hoursTitle')}
              summary={busiestHour
                ? t('admin.reports.hoursSummary', { hour: hourRange(busiestHour.hour), bookings: bookings(busiestHour.bookings) })
                : t('admin.reports.hoursEmpty')}
              labels={hours.map((h) => h.hour)}
              formatLabel={(h) => fmt.hour(h).slice(0, 2)}
              formatLongLabel={hourRange}
              series={[{ key: 'bookings', label: t('admin.reports.seriesBookings'), values: hours.map((h) => h.bookings), tone: 1 }]}
              formatValue={fmt.number}
              labelHeader={t('admin.reports.hourHeader')}
            />
          </div>
          <div className="card card-pad adm-viz-card">
            <ColumnChart
              id="report-weekdays"
              integer
              title={t('admin.reports.weekdayTitle')}
              summary={busiestWeekday
                ? t('admin.reports.weekdaySummary', { day: fmt.weekdayLong(busiestWeekday.dayOfWeek), bookings: bookings(busiestWeekday.bookings) })
                : t('admin.reports.weekdayEmpty')}
              labels={weekdays.map((d) => d.dayOfWeek)}
              formatLabel={fmt.weekdayShort}
              formatLongLabel={fmt.weekdayLong}
              series={[{ key: 'bookings', label: t('admin.reports.seriesBookings'), values: weekdays.map((d) => d.bookings), tone: 1 }]}
              formatValue={fmt.number}
              labelHeader={t('admin.reports.weekdayHeader')}
            />
          </div>
        </div>
        <div className="card card-pad adm-viz-card">
          <HBarList
            title={t('admin.reports.statusTitle')}
            summary={totals.bookings ? t('admin.reports.statusSummary', { bookings: bookings(totals.bookings) }) : null}
            emptyText={t('admin.reports.statusEmpty')}
            items={statuses.map((s) => ({ key: s.name, label: t(`status.${s.name}`), value: s.count, share: fmt.decimal(s.share) }))}
            formatValue={fmt.number}
          />
        </div>
      </section>

      <section className="admin-section" aria-labelledby="report-top">
        <h2 id="report-top" className="admin-h2">{t('admin.reports.leaders')}</h2>
        <div className="adm-viz-grid">
          <RankTable title={t('admin.reports.topProviders')} rows={report.topProviders} fmt={fmt} t={t} nameHeader={t('admin.reports.colProvider')}
            link={(p) => ({ to: appointmentsLink(p), label: t('admin.reports.viewAppointments', { name: p.name }) })} />
          <RankTable title={t('admin.reports.topServices')} rows={report.topServices} fmt={fmt} t={t} nameHeader={t('admin.reports.colService')} />
        </div>
      </section>
    </>
  );
}

function RankTable({ title, rows, fmt, t, nameHeader, link }) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <div className="adm-rank">
      <h3 className="admin-h3">{title}</h3>
      {list.length === 0 ? <p className="hint">{t('admin.reports.noRanking')}</p> : (
        <TableWrap label={title}>
          <table className="table admin-table adm-rank-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="adm-num">{t('admin.reports.colRank')}</th>
                <th scope="col">{nameHeader}</th>
                <th scope="col" className="adm-num">{t('admin.reports.colBookings')}</th>
                <th scope="col" className="adm-num">{t('admin.reports.colRevenue')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => {
                const target = link ? link(r) : null;
                return (
                  <tr key={r.id ?? r.name}>
                    <td className="adm-num">{fmt.number(i + 1)}</td>
                    <th scope="row">{target ? <Link to={target.to} aria-label={target.label}>{r.name}</Link> : r.name}</th>
                    <td className="adm-num">{fmt.number(r.bookings)}</td>
                    <td className="adm-num">{fmt.money(r.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
