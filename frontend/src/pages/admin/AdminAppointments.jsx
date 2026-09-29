import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import StatusBadge from '../../components/StatusBadge';
import { exportAppointments, fetchAppointments } from '../../api/admin';
import AdminLayout from './AdminLayout';
import ProviderPicker from './ProviderPicker';
import { DataState, ExportButtons, FilterDate, FilterSelect, Pager, SearchBox, TableWrap } from './adminUi';
import { useAdminFormat, useLoader, usePlural, useUrlFilters } from './adminHooks';

const PAGE_SIZE = 20;
const DEFAULTS = { from: '', to: '', status: '', providerId: '', providerName: '', q: '', page: 0 };
export const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

/** The API filters for the current view (the provider's name is only kept for display). */
export function appointmentQuery(filters) {
  return { from: filters.from, to: filters.to, status: filters.status, providerId: filters.providerId, q: filters.q };
}

/** Appointments (FR-45): every booking with date / status / provider / text filters and CSV / PDF export. */
export default function AdminAppointments() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const rangeInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const query = appointmentQuery(filters);
  const list = useLoader(
    () => (rangeInvalid ? Promise.resolve(null) : fetchAppointments({ ...query, page: filters.page, size: PAGE_SIZE })),
    rangeInvalid ? 'invalid' : JSON.stringify(filters)
  );

  const page = list.data;
  const rows = Array.isArray(page?.content) ? page.content : [];
  const filtered = Boolean(filters.from || filters.to || filters.status || filters.providerId || filters.q);

  const openRow = (e, id) => {
    if (e.target.closest('a, button')) return;
    navigate(`/appointments/${id}`);
  };

  return (
    <AdminLayout
      title={t('admin.appointments.title')}
      subtitle={t('admin.appointments.subtitle')}
      actions={<ExportButtons label={t('admin.appointments.exportLabel')} disabled={rangeInvalid}
        onExport={(format) => exportAppointments(format, query)} />}
    >
      <p className="hint admin-export-hint">{t('admin.appointments.exportHint')}</p>
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <FilterDate label={t('admin.common.from')} value={filters.from} max={filters.to || undefined}
          onChange={(from) => setFilters({ from })} invalid={rangeInvalid} describedBy={rangeInvalid ? 'appt-range-error' : undefined} />
        <FilterDate label={t('admin.common.to')} value={filters.to} min={filters.from || undefined}
          onChange={(to) => setFilters({ to })} invalid={rangeInvalid} describedBy={rangeInvalid ? 'appt-range-error' : undefined} />
        <FilterSelect label={t('admin.appointments.status')} value={filters.status} onChange={(status) => setFilters({ status })}
          options={[{ value: '', label: t('admin.appointments.allStatuses') }, ...APPOINTMENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))]} />
        <ProviderPicker className="admin-filter" label={t('admin.appointments.provider')} placeholder={t('admin.common.allProviders')}
          value={filters.providerId ? { id: Number(filters.providerId), name: filters.providerName } : null}
          onChange={(p) => setFilters({ providerId: p ? String(p.id) : '', providerName: p ? p.name : '' })} />
        <SearchBox label={t('admin.appointments.search')} placeholder={t('admin.appointments.searchPlaceholder')} value={filters.q}
          onCommit={(q) => setFilters({ q })} />
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm admin-clear"
            onClick={() => setFilters({ from: '', to: '', status: '', providerId: '', providerName: '', q: '' })}>
            {t('admin.common.clearFilters')}
          </button>
        ) : null}
      </div>
      {rangeInvalid ? <p id="appt-range-error" className="form-error" role="alert">{t('admin.common.rangeInvalid')}</p> : null}

      {!rangeInvalid ? (
        <DataState loading={list.loading} error={list.error} hasData={Boolean(page)} onRetry={list.reload}
          empty={Boolean(page) && rows.length === 0} emptyTitle={t('admin.appointments.empty')} emptyText={filtered ? t('admin.appointments.emptyText') : null}>
          <p className="admin-count" aria-live="polite">{plural('admin.appointments.count', page?.totalElements || 0)}</p>
          <TableWrap label={t('admin.appointments.tableLabel')} busy={list.loading}>
            <table className="table admin-table">
              <caption className="sr-only">{t('admin.appointments.tableLabel')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.appointments.colRef')}</th>
                  <th scope="col">{t('admin.appointments.colWhen')}</th>
                  <th scope="col">{t('admin.appointments.colCustomer')}</th>
                  <th scope="col">{t('admin.appointments.colService')}</th>
                  <th scope="col">{t('admin.appointments.colStatus')}</th>
                  <th scope="col" className="adm-num">{t('admin.appointments.colAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="adm-row-link" onClick={(e) => openRow(e, a.id)}>
                    <th scope="row" className="adm-cell-main adm-nowrap">
                      <Link to={`/appointments/${a.id}`} aria-label={t('admin.appointments.open', { ref: a.bookingRef })}>{a.bookingRef}</Link>
                    </th>
                    <td className="adm-nowrap">
                      <span className="adm-cell-title">{fmt.date(a.date)}</span>
                      <span className="adm-cell-sub">{fmt.time(a.startTime)} – {fmt.time(a.endTime)}</span>
                      {a.timezone ? <span className="adm-cell-sub">{a.timezone}</span> : null}
                    </td>
                    <td>
                      <span className="adm-cell-title">{a.customerName}</span>
                      {a.customerEmail ? <span className="adm-cell-sub">{a.customerEmail}</span> : null}
                    </td>
                    <td>
                      <span className="adm-cell-title">{a.serviceName}</span>
                      <span className="adm-cell-sub">{a.providerName}</span>
                      {a.staffName ? <span className="adm-cell-sub">{t('admin.appointments.withStaff', { name: a.staffName })}</span> : null}
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="adm-num adm-nowrap">
                      <span className="adm-cell-title">{fmt.money(a.finalAmount)}</span>
                      {a.discount ? <span className="adm-cell-sub">{t('admin.appointments.discount', { amount: fmt.money(a.discount) })}</span> : null}
                      {a.paymentStatus ? (
                        <span className="adm-cell-sub">
                          <span className="sr-only">{t('admin.appointments.colPayment')}: </span><StatusBadge status={a.paymentStatus} />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={page?.page ?? filters.page} totalPages={page?.totalPages} onPage={(p) => setFilters({ page: p })} />
        </DataState>
      ) : null}
    </AdminLayout>
  );
}
