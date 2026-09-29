import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import StatusBadge, { useStatusLabel } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { availabilityApi, providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { formatMoney } from '../../utils/format';
import { ProviderShell, PageHead, ErrorState, EmptyState, SectionLoading, TimezoneNote } from './components/Shell';
import AppointmentActions from './components/AppointmentActions';
import WeekCalendar, { StatusLegend } from './components/WeekCalendar';
import useLoad from './lib/useLoad';
import { APPOINTMENT_STATUSES, canCollect, gridHours } from './lib/schedule';
import { addDaysISO, fmtDate, fmtTime, minutesNowInZone, mondayOf, parseISODate, todayInZone } from './lib/time';
import { blobErrorMessage, saveResponse } from './lib/download';

const PAGE_SIZE = 20;

// Kept for older imports: the stats endpoint reports todayAppointments / upcomingAppointments / ...
export function normalizeStats(s = {}) {
  const pick = (...keys) => Number(keys.map((k) => s?.[k]).find((v) => v !== undefined && v !== null) ?? 0) || 0;
  return {
    today: pick('todayAppointments', 'today'),
    upcoming: pick('upcomingAppointments', 'upcoming'),
    completed: pick('completedAppointments', 'completed'),
    cancelled: pick('cancelledAppointments', 'cancelled')
  };
}

/** Which view to open: explicit ?view=, else the list when a filter or ?ref= is present. */
export function initialView(params) {
  const view = params.get('view');
  if (view === 'week' || view === 'list') return view;
  return ['ref', 'q', 'status', 'from', 'to', 'page'].some((k) => params.get(k)) ? 'list' : 'week';
}

function useParamsUpdater() {
  const [params, setParams] = useSearchParams();
  const update = (changes, opts) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined || v === false) next.delete(k);
      else next.set(k, String(v));
    });
    setParams(next, opts);
  };
  return [params, update];
}

function WeekView({ params, update, today, timezone, staff }) {
  const { t, locale } = useI18n();
  const requested = params.get('week');
  const monday = mondayOf(parseISODate(requested) ? requested : today);
  const sunday = addDaysISO(monday, 6);
  const staffId = params.get('staffId') || '';
  const showCancelled = params.get('cancelled') === '1';
  const apptQ = useLoad(() => providerApi.appointments({ from: monday, to: sunday, staffId, size: 200 }), [monday, staffId]);
  const hoursQ = useLoad(() => availabilityApi.mine(), []);
  const all = apptQ.data?.content || [];
  const list = all.filter((a) => showCancelled || a.status !== 'CANCELLED');
  const hours = gridHours(hoursQ.data?.availability || [], list);
  const range = `${fmtDate(monday, locale, { day: 'numeric', month: 'short' })} – ${fmtDate(sunday, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const thisWeek = mondayOf(today) === monday;

  return (
    <section aria-labelledby="week-title">
      <div className="pp-toolbar">
        <div className="pp-weeknav">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => update({ week: addDaysISO(monday, -7) })}>
            <span aria-hidden="true">‹ </span>{t('provider.schedule.prevWeek')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={thisWeek} onClick={() => update({ week: '' })}>
            {t('provider.schedule.thisWeek')}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => update({ week: addDaysISO(monday, 7) })}>
            {t('provider.schedule.nextWeek')}<span aria-hidden="true"> ›</span>
          </button>
        </div>
        <h2 className="pp-h2 pp-weektitle" id="week-title">{range}</h2>
        <div className="pp-toolbar-filters">
          <label className="pp-inline-field">
            <span>{t('provider.schedule.staff')}</span>
            <select className="filter-control" value={staffId} onChange={(e) => update({ staffId: e.target.value })}>
              <option value="">{t('provider.schedule.allStaff')}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ` (${t('provider.team.inactive')})`}</option>)}
            </select>
          </label>
          <label className="pp-check-inline">
            <input type="checkbox" checked={showCancelled} onChange={(e) => update({ cancelled: e.target.checked ? '1' : '' })} />
            <span>{t('provider.schedule.showCancelled')}</span>
          </label>
        </div>
      </div>

      {apptQ.error ? <ErrorState error={apptQ.error} onRetry={apptQ.reload} /> : !apptQ.data ? <SectionLoading /> : (
        <div className={apptQ.loading ? 'pp-stale' : ''} aria-busy={apptQ.loading || undefined}>
          <p className="pp-muted pp-summary" role="status">
            {t('provider.schedule.weekCount', { count: list.length, range })}
            {apptQ.data.totalElements > all.length ? ` ${t('provider.schedule.truncated', { shown: all.length })}` : ''}
          </p>
          <WeekCalendar monday={monday} appointments={list} hours={hours} today={today} nowMinutes={minutesNowInZone(timezone)} />
          <StatusLegend />
          {list.length === 0 && <p className="pp-muted mt-2">{t('provider.schedule.weekEmpty')}</p>}
        </div>
      )}
    </section>
  );
}

function PaymentCell({ a }) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const p = a.payment;
  return (
    <>
      <strong>{formatMoney(a.finalAmount)}</strong>
      {p?.method && <div className="pp-cell-sub">{statusLabel(p.method)}</div>}
      {p?.status && <div className="pp-cell-sub">{statusLabel(p.status)}</div>}
      {canCollect(a) && <div className="pp-cell-due">{t('provider.schedule.due', { amount: formatMoney(p.balanceDue) })}</div>}
    </>
  );
}

function ListView({ params, update, staff }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const statusLabel = useStatusLabel();
  const formId = useId();
  const status = params.get('status') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const staffId = params.get('staffId') || '';
  const q = params.get('q') ?? params.get('ref') ?? '';
  const page = Math.max(0, Number(params.get('page')) || 0);
  const [qInput, setQInput] = useState(q);
  const [exporting, setExporting] = useState(null);
  const badRange = Boolean(from && to && from > to);

  useEffect(() => { setQInput(q); }, [q]);

  const listQ = useLoad(
    () => (badRange ? Promise.resolve(null) : providerApi.appointments({ status, from, to, staffId, q, page, size: PAGE_SIZE })),
    [status, from, to, staffId, q, page, badRange]
  );
  const data = listQ.data;
  const rows = data?.content || [];

  const setFilter = (changes) => update({ ...changes, page: '' });
  const onSearch = (e) => {
    e.preventDefault();
    update({ q: qInput.trim(), ref: '', page: '' });
  };
  const clearAll = () => {
    setQInput('');
    update({ status: '', from: '', to: '', staffId: '', q: '', ref: '', page: '' });
  };
  const onUpdated = (updated) => listQ.setData((d) => d && ({ ...d, content: d.content.map((a) => (a.id === updated.id ? updated : a)) }));

  const doExport = async (format) => {
    setExporting(format);
    try {
      const res = await providerApi.exportAppointments({ format, status, from, to });
      const name = saveResponse(res, `appointments.${format}`);
      toast(t('provider.schedule.exported', { name }), 'success');
    } catch (err) {
      toast(await blobErrorMessage(err, t('provider.schedule.exportFailed')), 'error');
    } finally {
      setExporting(null);
    }
  };

  const filtered = Boolean(status || from || to || staffId || q);

  return (
    <section aria-labelledby="list-title">
      <h2 className="sr-only" id="list-title">{t('provider.schedule.listTitle')}</h2>
      <div className="pp-filters card card-pad">
        <form role="search" className="pp-search" onSubmit={onSearch} aria-label={t('provider.schedule.searchLabel')}>
          <label htmlFor={`${formId}-q`} className="sr-only">{t('provider.schedule.searchLabel')}</label>
          <input id={`${formId}-q`} type="search" className="filter-control" value={qInput} onChange={(e) => setQInput(e.target.value)}
            placeholder={t('provider.schedule.searchPlaceholder')} />
          <button type="submit" className="btn btn-primary btn-sm">{t('provider.common.search')}</button>
        </form>
        <div className="pp-filter-row">
          <div className="field">
            <label htmlFor={`${formId}-status`}>{t('provider.schedule.status')}</label>
            <select id={`${formId}-status`} value={status} onChange={(e) => setFilter({ status: e.target.value })}>
              <option value="">{t('provider.schedule.allStatuses')}</option>
              {APPOINTMENT_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${formId}-from`}>{t('provider.schedule.from')}</label>
            <input id={`${formId}-from`} type="date" value={from} max={to || undefined} onChange={(e) => setFilter({ from: e.target.value })}
              aria-invalid={badRange || undefined} aria-describedby={badRange ? `${formId}-range` : undefined} />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-to`}>{t('provider.schedule.to')}</label>
            <input id={`${formId}-to`} type="date" value={to} min={from || undefined} onChange={(e) => setFilter({ to: e.target.value })}
              aria-invalid={badRange || undefined} aria-describedby={badRange ? `${formId}-range` : undefined} />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-staff`}>{t('provider.schedule.staff')}</label>
            <select id={`${formId}-staff`} value={staffId} onChange={(e) => setFilter({ staffId: e.target.value })}>
              <option value="">{t('provider.schedule.allStaff')}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {badRange && <p className="hint error-text" id={`${formId}-range`}>{t('provider.schedule.badRange')}</p>}
        <div className="pp-filter-actions">
          {filtered && <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>{t('provider.schedule.clearFilters')}</button>}
          <span className="pp-spacer" />
          <span className="hint pp-export-hint">{t('provider.schedule.exportHint')}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => doExport('csv')} disabled={Boolean(exporting) || badRange}>
            {exporting === 'csv' ? t('provider.common.working') : t('provider.schedule.exportCsv')}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => doExport('pdf')} disabled={Boolean(exporting) || badRange}>
            {exporting === 'pdf' ? t('provider.common.working') : t('provider.schedule.exportPdf')}
          </button>
        </div>
      </div>

      {listQ.error ? <ErrorState error={listQ.error} onRetry={listQ.reload} /> : badRange ? null : !data ? <SectionLoading /> : rows.length === 0 ? (
        <EmptyState title={filtered ? t('provider.schedule.noMatches') : t('provider.schedule.none')}
          text={filtered ? t('provider.schedule.noMatchesText') : t('provider.schedule.noneText')}
          action={filtered ? <button type="button" className="btn btn-outline btn-sm" onClick={clearAll}>{t('provider.schedule.clearFilters')}</button> : null} />
      ) : (
        <div className={listQ.loading ? 'pp-stale' : ''} aria-busy={listQ.loading || undefined}>
          <p className="pp-muted pp-summary" role="status">{t('provider.schedule.resultCount', { count: data.totalElements })}</p>
          <div className="card table-wrap">
            <table className="table pp-table pp-appt-table">
              <caption className="sr-only">{t('provider.schedule.listTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('provider.schedule.cols.when')}</th>
                  <th scope="col">{t('provider.schedule.cols.customer')}</th>
                  <th scope="col">{t('provider.schedule.cols.service')}</th>
                  <th scope="col">{t('provider.schedule.cols.payment')}</th>
                  <th scope="col">{t('provider.schedule.cols.status')}</th>
                  <th scope="col">{t('provider.schedule.cols.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="pp-nowrap">
                      <strong>{fmtDate(a.date, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                      <div>{fmtTime(a.startTime, locale)} – {fmtTime(a.endTime, locale)}</div>
                      <div className="pp-cell-sub"><span className="sr-only">{t('provider.schedule.cols.booking')}: </span><span className="pp-ref">{a.bookingRef}</span></div>
                    </td>
                    <td className="pp-cell-person">
                      <strong>{a.customerName}</strong>
                      {a.customerPhone && <div className="pp-cell-sub pp-nowrap">{a.customerPhone}</div>}
                      {a.customerEmail && <div className="pp-cell-sub pp-ellipsis" title={a.customerEmail}>{a.customerEmail}</div>}
                    </td>
                    <td className="pp-cell-wrap">
                      {a.serviceName}
                      <div className="pp-cell-sub">{[a.staffName, a.mode === 'ONLINE' ? t('provider.mode.ONLINE') : null].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="pp-nowrap"><PaymentCell a={a} /></td>
                    <td><StatusBadge status={a.status} /></td>
                    <td><AppointmentActions appt={a} onUpdated={onUpdated} allowCollect /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <nav className="pager" aria-label={t('provider.common.pagination')}>
              <button type="button" className="btn btn-outline btn-sm" disabled={page <= 0} onClick={() => update({ page: page - 1 || '' })}>
                <span aria-hidden="true">‹ </span>{t('provider.common.prev')}
              </button>
              <span>{t('provider.common.pageOf', { page: page + 1, total: data.totalPages })}</span>
              <button type="button" className="btn btn-outline btn-sm" disabled={page + 1 >= data.totalPages} onClick={() => update({ page: page + 1 })}>
                {t('provider.common.next')}<span aria-hidden="true"> ›</span>
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

export default function ProviderAppointments() {
  const { t } = useI18n();
  const [params, update] = useParamsUpdater();
  const meQ = useLoad(() => providerApi.me(), []);
  const staffQ = useLoad(() => providerApi.staff(), []);
  const timezone = meQ.data?.timezone;
  const today = todayInZone(timezone);
  const view = initialView(params);
  const staff = staffQ.data || [];

  return (
    <ProviderShell>
      <PageHead title={t('provider.schedule.title')} lead={t('provider.schedule.lead')} />
      <TimezoneNote timezone={timezone} />
      <div className="pp-seg" role="group" aria-label={t('provider.schedule.viewLabel')}>
        <button type="button" aria-pressed={view === 'week'} className={view === 'week' ? 'active' : ''} onClick={() => update({ view: 'week' })}>
          <span aria-hidden="true">▦ </span>{t('provider.schedule.weekView')}
        </button>
        <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => update({ view: 'list' })}>
          <span aria-hidden="true">☰ </span>{t('provider.schedule.listView')}
        </button>
      </div>
      {meQ.loading && !meQ.data && !meQ.error ? <SectionLoading /> : view === 'week'
        ? <WeekView params={params} update={update} today={today} timezone={timezone} staff={staff} />
        : <ListView params={params} update={update} staff={staff} />}
    </ProviderShell>
  );
}
