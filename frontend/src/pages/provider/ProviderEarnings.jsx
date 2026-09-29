import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStatusLabel } from '../../components/StatusBadge';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { appointmentApi, providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { formatMoney } from '../../utils/format';
import { ProviderShell, PageHead, ErrorState, EmptyState, SectionLoading } from './components/Shell';
import StatTile, { StatRow } from './components/StatTile';
import { BarList, ChartCard, ColumnChart } from './components/charts';
import useLoad from './lib/useLoad';
import { binDays, hourRange, maxIndex } from './lib/chart';
import { addDaysISO, fmtDate, fmtHour, mondayOf, todayInZone, weekdayName } from './lib/time';
import { blobErrorMessage, saveResponse } from './lib/download';

const PAGE = 15;
export const RANGE_PRESETS = ['default', 'last7', 'last30', 'last90', 'thisMonth', 'next30', 'custom'];

/** { from, to } for a preset relative to `today` (provider-local); 'default' = the API default. */
export function presetRange(preset, today) {
  switch (preset) {
    case 'last7': return { from: addDaysISO(today, -6), to: today };
    case 'last30': return { from: addDaysISO(today, -29), to: today };
    case 'last90': return { from: addDaysISO(today, -89), to: today };
    case 'thisMonth': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'next30': return { from: today, to: addDaysISO(today, 29) };
    default: return { from: '', to: '' };
  }
}

function PaymentsTable({ payments }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const statusLabel = useStatusLabel();
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(null);
  const pages = Math.max(1, Math.ceil(payments.length / PAGE));
  const rows = payments.slice(page * PAGE, page * PAGE + PAGE);

  const invoice = async (p) => {
    setDownloading(p.id);
    try {
      const res = await appointmentApi.invoice(p.appointmentId);
      saveResponse(res, `invoice-${p.bookingRef}.pdf`);
    } catch (err) {
      toast(await blobErrorMessage(err, t('provider.earnings.invoiceFailed')), 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <div className="card table-wrap">
        <table className="table pp-table">
          <caption className="sr-only">{t('provider.earnings.paymentsTitle')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('provider.earnings.cols.booking')}</th>
              <th scope="col">{t('provider.earnings.cols.customer')}</th>
              <th scope="col">{t('provider.earnings.cols.method')}</th>
              <th scope="col">{t('provider.earnings.cols.status')}</th>
              <th scope="col" className="pp-num">{t('provider.earnings.cols.amount')}</th>
              <th scope="col">{t('provider.earnings.cols.paidAt')}</th>
              <th scope="col">{t('provider.earnings.cols.invoice')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/appointments/${p.appointmentId}`} className="pp-ref">{p.bookingRef}</Link>
                  <div className="pp-cell-sub">{p.serviceName}</div>
                </td>
                <td>{p.customerName}</td>
                <td>{statusLabel(p.method)}{p.option === 'DEPOSIT' ? <div className="pp-cell-sub">{t('provider.payOption.DEPOSIT')}</div> : null}</td>
                <td><StatusBadge status={p.status} /></td>
                <td className="pp-num pp-nowrap">
                  {formatMoney(p.amount)}
                  {p.balanceDue > 0 && <div className="pp-cell-due">{t('provider.earnings.dueAmount', { amount: formatMoney(p.balanceDue) })}</div>}
                  {p.refundAmount > 0 && <div className="pp-cell-sub">{t('provider.earnings.refundedAmount', { amount: formatMoney(p.refundAmount) })}</div>}
                </td>
                <td className="pp-nowrap">{p.paidAt ? fmtDate(String(p.paidAt).slice(0, 10), locale) : '—'}</td>
                <td>
                  {p.invoiceNumber ? (
                    <button type="button" className="btn btn-outline btn-xs" disabled={downloading === p.id} onClick={() => invoice(p)}>
                      {downloading === p.id ? t('provider.common.working') : t('provider.earnings.download')}
                      <span className="sr-only"> {t('provider.earnings.invoiceFor', { number: p.invoiceNumber })}</span>
                    </button>
                  ) : <span className="pp-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="pager" aria-label={t('provider.earnings.paymentsPages')}>
          <button type="button" className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <span aria-hidden="true">‹ </span>{t('provider.common.prev')}
          </button>
          <span>{t('provider.common.pageOf', { page: page + 1, total: pages })}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            {t('provider.common.next')}<span aria-hidden="true"> ›</span>
          </button>
        </nav>
      )}
    </>
  );
}

function Reports({ today }) {
  const { t, locale } = useI18n();
  const statusLabel = useStatusLabel();
  const uid = useId();
  const [preset, setPreset] = useState('default');
  const [custom, setCustom] = useState({ from: addDaysISO(today, -29), to: today });
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [rangeError, setRangeError] = useState('');
  const reportQ = useLoad(() => providerApi.reports(applied), [applied.from, applied.to]);
  const report = reportQ.data;

  const choose = (value) => {
    setPreset(value);
    setRangeError('');
    if (value !== 'custom') setApplied(presetRange(value, today));
  };
  const applyCustom = (e) => {
    e.preventDefault();
    if (!custom.from || !custom.to || custom.from > custom.to) {
      setRangeError(t('provider.reports.badRange'));
      return;
    }
    if (addDaysISO(custom.from, 366) < custom.to) {
      setRangeError(t('provider.reports.tooLong'));
      return;
    }
    setRangeError('');
    setApplied({ ...custom });
  };

  const n = (v) => Number(v || 0).toLocaleString(locale);
  const pct = (v) => `${Number(v || 0).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  const series = [
    { key: 'kept', label: t('provider.reports.kept'), color: 'var(--viz-s1)' },
    { key: 'cancelled', label: t('provider.reports.cancelled'), color: 'var(--viz-s2)' }
  ];

  const daily = useMemo(() => {
    if (!report) return null;
    const { unit, bins } = binDays(report.byDay || [], mondayOf);
    const data = bins.map((b) => ({
      key: b.key,
      tick: fmtDate(b.date, locale, { day: 'numeric', month: 'short' }),
      label: unit === 'week'
        ? t('provider.reports.weekOf', { date: fmtDate(b.date, locale, { day: 'numeric', month: 'short', year: 'numeric' }) })
        : fmtDate(b.date, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      values: { kept: Math.max(0, (b.bookings || 0) - (b.cancellations || 0)), cancelled: b.cancellations || 0 },
      raw: b
    }));
    const peak = maxIndex(data.map((d) => d.raw.bookings));
    return { unit, data, peakKey: peak >= 0 ? data[peak].key : null };
  }, [report, locale, t]);

  const hours = useMemo(() => {
    const rows = hourRange(report?.byHour || []);
    const data = rows.map((r) => ({ key: String(r.hour), tick: fmtHour(r.hour, locale), label: `${fmtHour(r.hour, locale)} – ${fmtHour(r.hour + 1, locale)}`, values: { bookings: r.bookings } }));
    const peak = maxIndex(rows.map((r) => r.bookings));
    return { data, peakKey: peak >= 0 ? data[peak].key : null, peakLabel: peak >= 0 ? data[peak].label : '' };
  }, [report, locale]);

  const rangeLabel = report ? `${fmtDate(report.from, locale)} – ${fmtDate(report.to, locale)}` : '';
  const totals = report?.totals;

  return (
    <section className="pp-section" aria-labelledby={`${uid}-title`}>
      <h2 className="pp-h2" id={`${uid}-title`}>{t('provider.reports.title')}</h2>
      <div className="pp-filters card card-pad">
        <div className="pp-filter-row">
          <div className="field">
            <label htmlFor={`${uid}-preset`}>{t('provider.reports.range')}</label>
            <select id={`${uid}-preset`} value={preset} onChange={(e) => choose(e.target.value)}>
              {RANGE_PRESETS.map((p) => <option key={p} value={p}>{t(`provider.reports.presets.${p}`)}</option>)}
            </select>
          </div>
          {preset === 'custom' && (
            <form className="pp-custom-range" onSubmit={applyCustom} noValidate>
              <div className="field">
                <label htmlFor={`${uid}-from`}>{t('provider.schedule.from')}</label>
                <input id={`${uid}-from`} type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                  aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? `${uid}-err` : undefined} />
              </div>
              <div className="field">
                <label htmlFor={`${uid}-to`}>{t('provider.schedule.to')}</label>
                <input id={`${uid}-to`} type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? `${uid}-err` : undefined} />
              </div>
              <button type="submit" className="btn btn-primary btn-sm pp-apply">{t('provider.common.apply')}</button>
            </form>
          )}
        </div>
        {rangeError && <p className="hint error-text" id={`${uid}-err`} role="alert">{rangeError}</p>}
        {report && <p className="pp-muted pp-summary" role="status">{t('provider.reports.showing', { range: rangeLabel })}</p>}
      </div>

      {reportQ.error && !report ? <ErrorState error={reportQ.error} onRetry={reportQ.reload} /> : !report ? <SectionLoading /> : (
        <div className={reportQ.loading ? 'pp-stale' : ''} aria-busy={reportQ.loading || undefined}>
          {reportQ.error && <p className="form-error" role="alert">{t('provider.reports.refreshFailed')}</p>}
          <StatRow label={t('provider.reports.totals')}>
            <StatTile label={t('provider.reports.kpi.bookings')} value={n(totals.bookings)} sub={t('provider.reports.kpi.upcoming', { count: n(totals.upcoming) })} />
            <StatTile label={t('provider.reports.kpi.completed')} value={n(totals.completed)} />
            <StatTile label={t('provider.reports.kpi.cancellationRate')} value={pct(totals.cancellationRate)} sub={t('provider.reports.kpi.cancelledCount', { count: n(totals.cancelled) })} />
            <StatTile label={t('provider.reports.kpi.noShowRate')} value={pct(totals.noShowRate)} sub={t('provider.reports.kpi.noShowCount', { count: n(totals.noShows) })} />
            <StatTile label={t('provider.reports.kpi.revenue')} value={formatMoney(totals.revenue)} sub={t('provider.reports.kpi.refunds', { amount: formatMoney(totals.refunds) })} />
            <StatTile label={t('provider.reports.kpi.average')} value={formatMoney(totals.averageBookingValue)} />
          </StatRow>

          <ChartCard title={daily.unit === 'week' ? t('provider.reports.perWeek') : t('provider.reports.perDay')}
            lead={t('provider.reports.perDayLead', { range: rangeLabel })}
            legend={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
            table={(
              <table className="table pp-table">
                <caption className="sr-only">{daily.unit === 'week' ? t('provider.reports.perWeek') : t('provider.reports.perDay')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{daily.unit === 'week' ? t('provider.reports.cols.week') : t('provider.reports.cols.date')}</th>
                    <th scope="col" className="pp-num">{t('provider.reports.cols.bookings')}</th>
                    <th scope="col" className="pp-num">{t('provider.reports.cols.cancellations')}</th>
                    <th scope="col" className="pp-num">{t('provider.reports.cols.revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.data.map((d) => (
                    <tr key={d.key}>
                      <th scope="row">{d.label}</th>
                      <td className="pp-num">{n(d.raw.bookings)}</td>
                      <td className="pp-num">{n(d.raw.cancellations)}</td>
                      <td className="pp-num">{formatMoney(d.raw.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}>
            {totals.bookings === 0 ? <p className="pp-muted viz-empty">{t('provider.reports.noBookings')}</p> : (
              <ColumnChart data={daily.data} series={series} highlight={daily.peakKey} formatValue={n}
                ariaLabel={t('provider.reports.perDayAria', { range: rangeLabel })}
                describe={(d) => t('provider.reports.dayReadout', { label: d.label, bookings: n(d.raw.bookings), cancelled: n(d.raw.cancellations), revenue: formatMoney(d.raw.revenue) })} />
            )}
          </ChartCard>

          <div className="pp-chart-grid">
            <ChartCard title={t('provider.reports.peakHours')}
              lead={hours.peakLabel ? t('provider.reports.peakHoursLead', { hour: hours.peakLabel }) : t('provider.reports.peakHoursNone')}
              table={hours.data.length ? (
                <table className="table pp-table">
                  <caption className="sr-only">{t('provider.reports.peakHours')}</caption>
                  <thead><tr><th scope="col">{t('provider.reports.cols.hour')}</th><th scope="col" className="pp-num">{t('provider.reports.cols.bookings')}</th></tr></thead>
                  <tbody>{hours.data.map((h) => <tr key={h.key}><th scope="row">{h.label}</th><td className="pp-num">{n(h.values.bookings)}</td></tr>)}</tbody>
                </table>
              ) : null}>
              {hours.data.length === 0 ? <p className="pp-muted viz-empty">{t('provider.reports.noBookings')}</p> : (
                <ColumnChart data={hours.data} series={[{ key: 'bookings', label: t('provider.reports.cols.bookings'), color: 'var(--viz-s1)' }]}
                  highlight={hours.peakKey} formatValue={n} height={160} ariaLabel={t('provider.reports.peakHoursAria')}
                  describe={(d) => t('provider.reports.hourReadout', { label: d.label, count: n(d.values.bookings) })} />
              )}
            </ChartCard>

            <ChartCard title={t('provider.reports.byWeekday')} lead={t('provider.reports.byWeekdayLead')}>
              <BarList ariaLabel={t('provider.reports.byWeekday')} formatValue={n}
                rows={(report.byWeekday || []).map((w) => ({ key: w.dayOfWeek, label: weekdayName(w.dayOfWeek, locale), value: w.bookings }))} />
            </ChartCard>

            <ChartCard title={t('provider.reports.byStatus')} lead={t('provider.reports.byStatusLead')}>
              {(report.byStatus || []).length === 0 ? <p className="pp-muted viz-empty">{t('provider.reports.noBookings')}</p> : (
                <BarList ariaLabel={t('provider.reports.byStatus')} formatValue={n}
                  rows={report.byStatus.map((s) => ({ key: s.name, label: statusLabel(s.name), value: s.count }))} />
              )}
            </ChartCard>

            <ChartCard title={t('provider.reports.topServices')} lead={t('provider.reports.topServicesLead')}>
              {(report.topServices || []).length === 0 ? <p className="pp-muted viz-empty">{t('provider.reports.noBookings')}</p> : (
                <BarList ariaLabel={t('provider.reports.topServices')} formatValue={n}
                  rows={report.topServices.map((s) => ({ key: s.id ?? s.name, label: s.name, sub: t('provider.reports.revenueOf', { amount: formatMoney(s.revenue) }), value: s.bookings }))} />
              )}
            </ChartCard>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProviderEarnings() {
  const { t } = useI18n();
  const meQ = useLoad(() => providerApi.me(), []);
  const earningsQ = useLoad(() => providerApi.earnings(), []);
  const earnings = earningsQ.data;
  const payments = earnings?.payments || [];
  const today = todayInZone(meQ.data?.timezone);
  const ready = Boolean(meQ.data) || Boolean(meQ.error);

  return (
    <ProviderShell>
      <PageHead title={t('provider.earnings.title')} lead={t('provider.earnings.lead')} />

      <section className="pp-section" aria-labelledby="earn-title">
        <h2 className="pp-h2" id="earn-title">{t('provider.earnings.summaryTitle')}</h2>
        {earningsQ.error ? <ErrorState error={earningsQ.error} onRetry={earningsQ.reload} /> : !earnings ? <SectionLoading /> : (
          <>
            <StatRow label={t('provider.earnings.summaryTitle')}>
              <StatTile label={t('provider.earnings.total')} value={formatMoney(earnings.totalCollected)} sub={t('provider.earnings.totalHint')} />
              <StatTile label={t('provider.earnings.online')} value={formatMoney(earnings.onlineCollected)} />
              <StatTile label={t('provider.earnings.due')} value={formatMoney(earnings.dueAtVenue)} tone={earnings.dueAtVenue > 0 ? 'attention' : undefined}
                sub={t('provider.earnings.dueHint')} />
              <StatTile label={t('provider.earnings.refunded')} value={formatMoney(earnings.refunded)} />
            </StatRow>
            <h3 className="pp-h3 mt-3">{t('provider.earnings.paymentsTitle')}</h3>
            {payments.length === 0
              ? <EmptyState headingLevel={3} title={t('provider.earnings.none')} text={t('provider.earnings.noneText')} />
              : <PaymentsTable payments={payments} />}
          </>
        )}
      </section>

      {ready ? <Reports today={today} /> : <SectionLoading />}
    </ProviderShell>
  );
}
