import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api/client';
import { deleteUser, exportUsers, fetchUsers, setUserActive } from '../../api/admin';
import AdminLayout from './AdminLayout';
import { ConfirmDialog, DataState, ExportButtons, FilterSelect, Pager, SearchBox, TableWrap } from './adminUi';
import { useAdminFormat, useLoader, usePlural, useUrlFilters } from './adminHooks';

const PAGE_SIZE = 20;
const DEFAULTS = { q: '', role: '', active: '', page: 0 };
const ROLES = ['CUSTOMER', 'PROVIDER', 'STAFF', 'ADMIN'];
const ROLE_BADGE = { ADMIN: 'badge-violet', PROVIDER: 'badge-brand', STAFF: 'badge-blue', CUSTOMER: 'badge-muted' };

/** "✓ E-mail" on screen, "E-mail verified" / "E-mail not verified" for screen readers. */
function VerifyItem({ ok, short, full }) {
  return (
    <li className={ok ? 'adm-ok' : 'adm-missing'}>
      <span aria-hidden="true">{ok ? '✓' : '✕'} {short}</span>
      <span className="sr-only">{full}</span>
    </li>
  );
}

/** Users (FR-44): search / filter, activate or deactivate, delete (anonymise) and export. */
export default function AdminUsers() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const toast = useToast();
  const { user: me } = useAuth();
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const list = useLoader(
    () => fetchUsers({ q: filters.q, role: filters.role, active: filters.active, page: filters.page, size: PAGE_SIZE }),
    JSON.stringify(filters)
  );
  const [pending, setPending] = useState(null); // { kind: 'deactivate' | 'delete', user }
  const [busyId, setBusyId] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const page = list.data;
  const users = Array.isArray(page?.content) ? page.content : [];
  const filtered = Boolean(filters.q || filters.role || filters.active);

  const replaceUser = (updated) => list.setData((d) => (d ? { ...d, content: d.content.map((u) => (u.id === updated.id ? updated : u)) } : d));

  const activate = async (u) => {
    setBusyId(u.id);
    try {
      replaceUser(await setUserActive(u.id, true));
      toast(t('admin.users.activated', { name: u.name }), 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const openDialog = (kind, u) => {
    setDialogError('');
    setPending({ kind, user: u });
  };

  const closeDialog = () => {
    if (!dialogBusy) setPending(null);
  };

  const confirm = async () => {
    const { kind, user: u } = pending;
    setDialogBusy(true);
    setDialogError('');
    try {
      if (kind === 'deactivate') {
        replaceUser(await setUserActive(u.id, false));
        toast(t('admin.users.deactivated', { name: u.name }), 'success');
      } else {
        await deleteUser(u.id);
        toast(t('admin.users.deleted', { name: u.name }), 'success');
        list.reload();
      }
      setPending(null);
    } catch (err) {
      setDialogError(getErrorMessage(err));
    } finally {
      setDialogBusy(false);
    }
  };

  return (
    <AdminLayout
      title={t('admin.users.title')}
      subtitle={t('admin.users.subtitle')}
      actions={<ExportButtons label={t('admin.users.exportLabel')} onExport={exportUsers} />}
    >
      <p className="hint admin-export-hint">{t('admin.users.exportHint')}</p>
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <SearchBox label={t('admin.users.search')} placeholder={t('admin.users.searchPlaceholder')} value={filters.q}
          onCommit={(q) => setFilters({ q })} />
        <FilterSelect label={t('admin.users.role')} value={filters.role} onChange={(role) => setFilters({ role })}
          options={[{ value: '', label: t('admin.users.allRoles') }, ...ROLES.map((r) => ({ value: r, label: t(`admin.roles.${r}`) }))]} />
        <FilterSelect label={t('admin.users.status')} value={filters.active} onChange={(active) => setFilters({ active })}
          options={[
            { value: '', label: t('admin.users.allStatuses') },
            { value: 'true', label: t('admin.common.active') },
            { value: 'false', label: t('admin.common.inactive') }
          ]} />
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm admin-clear" onClick={() => setFilters({ q: '', role: '', active: '' })}>
            {t('admin.common.clearFilters')}
          </button>
        ) : null}
      </div>

      <DataState loading={list.loading} error={list.error} hasData={Boolean(page)} onRetry={list.reload}
        empty={Boolean(page) && users.length === 0} emptyTitle={t('admin.users.empty')} emptyText={filtered ? t('admin.users.emptyText') : null}>
        <p className="admin-count" aria-live="polite">{plural('admin.users.count', page?.totalElements || 0)}</p>
        <TableWrap label={t('admin.users.tableLabel')} busy={list.loading}>
          <table className="table admin-table">
            <caption className="sr-only">{t('admin.users.tableLabel')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.users.colUser')}</th>
                <th scope="col">{t('admin.users.colRole')}</th>
                <th scope="col">{t('admin.users.colVerified')}</th>
                <th scope="col">{t('admin.users.colActivity')}</th>
                <th scope="col">{t('admin.users.colStatus')}</th>
                <th scope="col">{t('admin.common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = me?.id === u.id;
                return (
                  <tr key={u.id}>
                    <th scope="row" className="adm-cell-main">
                      <span className="adm-cell-title">{u.name}{self ? <span className="badge badge-muted adm-cell-tag">{t('admin.users.you')}</span> : null}</span>
                      <span className="adm-cell-sub">{u.email}</span>
                      {u.phone ? <span className="adm-cell-sub">{u.phone}</span> : null}
                    </th>
                    <td><span className={`badge ${ROLE_BADGE[u.role] || 'badge-muted'}`}>{t(`admin.roles.${u.role}`)}</span></td>
                    <td>
                      <ul className="plain-list adm-verify">
                        <VerifyItem ok={u.emailVerified} short={t('admin.users.emailShort')}
                          full={u.emailVerified ? t('admin.users.emailVerified') : t('admin.users.emailUnverified')} />
                        {u.phone ? (
                          <VerifyItem ok={u.phoneVerified} short={t('admin.users.phoneShort')}
                            full={u.phoneVerified ? t('admin.users.phoneVerified') : t('admin.users.phoneUnverified')} />
                        ) : null}
                      </ul>
                    </td>
                    <td className="adm-nowrap">
                      <span className="adm-cell-sub">{t('admin.users.lastLogin', { when: u.lastLoginAt ? fmt.dateTime(u.lastLoginAt) : t('admin.common.never') })}</span>
                      <span className="adm-cell-sub">{t('admin.users.joined', { when: fmt.date(u.createdAt) })}</span>
                    </td>
                    <td>
                      {u.active
                        ? <span className="badge badge-success">{t('admin.common.active')}</span>
                        : <span className="badge badge-danger">{t('admin.common.inactive')}</span>}
                    </td>
                    <td>
                      <div className="adm-actions">
                        {u.role === 'CUSTOMER' ? (
                          <Link className="btn btn-ghost btn-xs" to={`/dashboard/admin/appointments?q=${encodeURIComponent(u.email)}`}
                            aria-label={t('admin.users.bookingsOf', { name: u.name })}>
                            {t('admin.users.bookings')}
                          </Link>
                        ) : null}
                        {!self && (u.active ? (
                          <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => openDialog('deactivate', u)}
                            aria-label={t('admin.users.deactivateName', { name: u.name })}>
                            {t('admin.users.deactivate')}
                          </button>
                        ) : (
                          <button type="button" className="btn btn-success btn-xs" disabled={busyId === u.id} onClick={() => activate(u)}
                            aria-label={t('admin.users.activateName', { name: u.name })}>
                            {busyId === u.id ? t('admin.common.working') : t('admin.users.activate')}
                          </button>
                        ))}
                        {!self ? (
                          <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => openDialog('delete', u)}
                            aria-label={t('admin.users.deleteName', { name: u.name })}>
                            {t('admin.common.delete')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <Pager page={page?.page ?? filters.page} totalPages={page?.totalPages} onPage={(p) => setFilters({ page: p })} />
      </DataState>

      {pending?.kind === 'deactivate' ? (
        <ConfirmDialog title={t('admin.users.deactivateTitle', { name: pending.user.name })} confirmLabel={t('admin.users.deactivate')}
          onConfirm={confirm} onClose={closeDialog} busy={dialogBusy} error={dialogError}>
          <p>{t('admin.users.deactivateText', { name: pending.user.name })}</p>
        </ConfirmDialog>
      ) : null}

      {pending?.kind === 'delete' ? (
        <ConfirmDialog title={t('admin.users.deleteTitle', { name: pending.user.name })} confirmLabel={t('admin.users.deleteConfirm')}
          busyLabel={t('admin.common.deleting')} onConfirm={confirm} onClose={closeDialog} busy={dialogBusy} error={dialogError}>
          <p>{t('admin.users.deleteText')}</p>
          <ul className="adm-confirm-list">
            <li>{t('admin.users.deleteKeeps')}</li>
            {pending.user.role === 'PROVIDER' ? <li>{t('admin.users.deleteProvider')}</li> : null}
            <li><strong>{t('admin.users.deleteIrreversible')}</strong></li>
          </ul>
        </ConfirmDialog>
      ) : null}
    </AdminLayout>
  );
}
