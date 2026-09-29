import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { fetchAuditLogs } from '../../api/admin';
import AdminLayout from './AdminLayout';
import { DataState, FilterDate, FilterSelect, Pager, SearchBox, TableWrap } from './adminUi';
import { useAdminFormat, useLoader, usePlural, useUrlFilters } from './adminHooks';

const PAGE_SIZE = 50;
const DEFAULTS = { action: '', entityType: '', actorId: '', from: '', to: '', page: 0 };

// Every action the backend records (AuditService.record callers), grouped for the filter.
export const AUDIT_ACTION_GROUPS = {
  account: ['LOGIN', 'LOGOUT', 'USER_REGISTERED', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'VERIFIED_EMAIL', 'VERIFIED_PHONE'],
  users: ['USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_DELETED'],
  providers: ['PROVIDER_VERIFIED', 'PROVIDER_REJECTED', 'PROVIDER_SUSPENDED', 'PROVIDER_PENDING', 'PROVIDER_PROFILE_UPDATED'],
  catalogue: ['SERVICE_CREATED', 'SERVICE_UPDATED', 'SERVICE_DELETED', 'SERVICE_ENABLED', 'SERVICE_DISABLED', 'SERVICE_ASSIGNED',
    'SERVICE_REASSIGNED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED', 'COUPON_CREATED', 'COUPON_UPDATED', 'COUPON_DELETED'],
  team: ['STAFF_CREATED', 'STAFF_UPDATED', 'STAFF_DEACTIVATED', 'STAFF_LOGIN_CREATED', 'AVAILABILITY_ADDED', 'AVAILABILITY_UPDATED',
    'AVAILABILITY_DELETED', 'AVAILABILITY_REPLACED', 'DATE_BLOCKED', 'DATE_UNBLOCKED', 'CUSTOM_HOURS_SET'],
  bookings: ['APPOINTMENT_BOOKED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_COMPLETED',
    'APPOINTMENT_NO_SHOW', 'APPOINTMENT_NOTES_UPDATED'],
  payments: ['PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'PAYMENT_COLLECTED_AT_VENUE', 'PAYMENT_SIGNATURE_INVALID'],
  reviews: ['REVIEW_CREATED', 'REVIEW_FLAGGED', 'REVIEW_APPROVED', 'REVIEW_REJECTED']
};
export const AUDIT_ENTITIES = ['User', 'Provider', 'Service', 'Category', 'Coupon', 'Staff', 'Availability', 'BlockedDate', 'Appointment', 'Payment', 'Review'];

/** 'SOME_NEW_CODE' -> 'Some new code' for actions without a translation. */
export function humanizeCode(code) {
  const text = String(code || '').toLowerCase().replace(/_/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

export function useAuditLabels() {
  const t = useT();
  const lookup = (prefix, code, fallback) => {
    const key = `${prefix}.${code}`;
    const label = t(key);
    return label === key ? fallback(code) : label;
  };
  return {
    action: (code) => lookup('admin.audit.actions', code, humanizeCode),
    entity: (type) => lookup('admin.audit.entities', type, (x) => x || '')
  };
}

/** Audit log (FR-48): filter by action, record type, user and dates; newest first. */
export default function AdminAudit() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const labels = useAuditLabels();
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const actorInvalid = Boolean(filters.actorId) && !/^\d+$/.test(filters.actorId);
  const rangeInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const invalid = actorInvalid || rangeInvalid;
  const list = useLoader(
    () => (invalid ? Promise.resolve(null) : fetchAuditLogs({
      action: filters.action, entityType: filters.entityType, actorId: filters.actorId, from: filters.from, to: filters.to,
      page: filters.page, size: PAGE_SIZE
    })),
    invalid ? 'invalid' : JSON.stringify(filters)
  );
  const page = list.data;
  const rows = Array.isArray(page?.content) ? page.content : [];
  const filtered = Boolean(filters.action || filters.entityType || filters.actorId || filters.from || filters.to);

  const entityCell = (row) => {
    if (!row.entityType) return '—';
    const text = row.entityId != null ? `${labels.entity(row.entityType)} #${row.entityId}` : labels.entity(row.entityType);
    if (row.entityType === 'Appointment' && row.entityId != null) return <Link to={`/appointments/${row.entityId}`}>{text}</Link>;
    return text;
  };

  return (
    <AdminLayout title={t('admin.audit.title')} subtitle={t('admin.audit.subtitle')}>
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <div className="field admin-filter">
          <label htmlFor="audit-action">{t('admin.audit.action')}</label>
          <select id="audit-action" value={filters.action} onChange={(e) => setFilters({ action: e.target.value })}>
            <option value="">{t('admin.audit.anyAction')}</option>
            {Object.entries(AUDIT_ACTION_GROUPS).map(([group, codes]) => (
              <optgroup key={group} label={t(`admin.audit.groups.${group}`)}>
                {codes.map((code) => <option key={code} value={code}>{labels.action(code)}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <FilterSelect label={t('admin.audit.entity')} value={filters.entityType} onChange={(entityType) => setFilters({ entityType })}
          options={[{ value: '', label: t('admin.audit.anyEntity') }, ...AUDIT_ENTITIES.map((e) => ({ value: e, label: labels.entity(e) }))]} />
        <SearchBox label={t('admin.audit.actor')} type="text" inputMode="numeric" pattern="[0-9]*" hint={t('admin.audit.actorHint')}
          value={filters.actorId} onCommit={(actorId) => setFilters({ actorId })} />
        <FilterDate label={t('admin.common.from')} value={filters.from} onChange={(from) => setFilters({ from })}
          invalid={rangeInvalid} describedBy={rangeInvalid ? 'audit-filter-error' : undefined} />
        <FilterDate label={t('admin.common.to')} value={filters.to} onChange={(to) => setFilters({ to })}
          invalid={rangeInvalid} describedBy={rangeInvalid ? 'audit-filter-error' : undefined} />
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm admin-clear"
            onClick={() => setFilters({ action: '', entityType: '', actorId: '', from: '', to: '' })}>
            {t('admin.common.clearFilters')}
          </button>
        ) : null}
      </div>
      {invalid ? (
        <p id="audit-filter-error" className="form-error" role="alert">
          {actorInvalid ? t('admin.audit.actorInvalid') : t('admin.common.rangeInvalid')}
        </p>
      ) : (
        <DataState loading={list.loading} error={list.error} hasData={Boolean(page)} onRetry={list.reload}
          empty={Boolean(page) && rows.length === 0} emptyTitle={t('admin.audit.empty')} emptyText={filtered ? t('admin.audit.emptyText') : null}>
          <p className="admin-count" aria-live="polite">{plural('admin.audit.count', page?.totalElements || 0)}</p>
          <TableWrap label={t('admin.audit.tableLabel')} busy={list.loading}>
            <table className="table admin-table adm-audit-table">
              <caption className="sr-only">{t('admin.audit.tableLabel')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.audit.colWhen')}</th>
                  <th scope="col">{t('admin.audit.colActor')}</th>
                  <th scope="col">{t('admin.audit.colAction')}</th>
                  <th scope="col">{t('admin.audit.colEntity')}</th>
                  <th scope="col">{t('admin.audit.colDetails')}</th>
                  <th scope="col">{t('admin.audit.colIp')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="adm-nowrap">{fmt.dateTime(row.createdAt)}</td>
                    <td>
                      {row.actorId != null ? (
                        <>
                          <span className="adm-cell-title">{row.actorEmail || `#${row.actorId}`}</span>
                          <span className="adm-cell-sub">
                            {row.actorRole ? t(`admin.roles.${row.actorRole}`) : null}
                            {' · '}
                            <button type="button" className="adm-link-btn" onClick={() => setFilters({ actorId: String(row.actorId) })}
                              aria-label={t('admin.audit.filterActor', { name: row.actorEmail || `#${row.actorId}` })}>
                              #{row.actorId}
                            </button>
                          </span>
                        </>
                      ) : (
                        <span className="adm-cell-title">{row.actorRole === 'SYSTEM' ? t('admin.audit.system') : t('admin.audit.unknown')}</span>
                      )}
                    </td>
                    <td>
                      <span className="adm-cell-title">{labels.action(row.action)}</span>
                      <code className="adm-code">{row.action}</code>
                    </td>
                    <td className="adm-nowrap">{entityCell(row)}</td>
                    <td className="adm-audit-details">{row.details || '—'}</td>
                    <td className="adm-nowrap"><code className="adm-code">{row.ipAddress || '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={page?.page ?? filters.page} totalPages={page?.totalPages} onPage={(p) => setFilters({ page: p })} />
        </DataState>
      )}
    </AdminLayout>
  );
}
