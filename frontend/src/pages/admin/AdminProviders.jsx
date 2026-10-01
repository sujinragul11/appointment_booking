import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { decideProvider, fetchProviders } from '../../api/admin';
import AdminLayout from './AdminLayout';
import { DataState, Pager, SearchBox, TabPanel, TableWrap, Tabs } from './adminUi';
import { useAdminFormat, useLoader, usePlural, useUrlFilters } from './adminHooks';

const PAGE_SIZE = 20;
const DEFAULTS = { status: 'PENDING', q: '', page: 0 };
const TABS = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'ALL'];
const NOTE_MAX = 500;

/** Decisions offered for each current status; a note is required to reject or suspend. */
export const DECISIONS = {
  PENDING: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['SUSPENDED'],
  REJECTED: ['VERIFIED'],
  SUSPENDED: ['VERIFIED']
};
export const needsNote = (status) => status === 'REJECTED' || status === 'SUSPENDED';

function decisionLabel(t, current, next) {
  if (next === 'VERIFIED') return current === 'SUSPENDED' ? t('admin.providers.reinstate') : t('admin.providers.approve');
  if (next === 'REJECTED') return t('admin.providers.reject');
  return t('admin.providers.suspend');
}

/** Providers: approval queue, status tabs, full details and approve / reject / suspend decisions. */
export default function AdminProviders() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const status = TABS.includes(filters.status) ? filters.status : 'PENDING';
  const list = useLoader(
    () => fetchProviders({ status: status === 'ALL' ? '' : status, q: filters.q, page: filters.page, size: PAGE_SIZE }),
    `${status}|${filters.q}|${filters.page}`
  );
  const [selected, setSelected] = useState(null);

  const page = list.data;
  const providers = Array.isArray(page?.content) ? page.content : [];

  const onDecided = (updated) => {
    setSelected(null);
    list.reload();
    return updated;
  };

  return (
    <AdminLayout title={t('admin.providers.title')} subtitle={t('admin.providers.subtitle')}>
      <Tabs idBase="provider-status" label={t('admin.providers.tabs')} value={status}
        tabs={TABS.map((key) => ({ key, label: t(`admin.providers.tab.${key}`) }))}
        onChange={(next) => setFilters({ status: next })} />
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <SearchBox label={t('admin.providers.search')} placeholder={t('admin.providers.searchPlaceholder')} value={filters.q}
          onCommit={(q) => setFilters({ q })} />
      </div>
      <TabPanel idBase="provider-status" value={status} busy={list.loading}>
        <DataState loading={list.loading} error={list.error} hasData={Boolean(page)} onRetry={list.reload}
          empty={Boolean(page) && providers.length === 0}
          emptyTitle={status === 'PENDING' && !filters.q ? t('admin.providers.emptyPending') : t('admin.providers.empty')}
          emptyText={status === 'PENDING' && !filters.q ? t('admin.providers.emptyPendingText') : t('admin.providers.emptyText')}>
          <p className="admin-count" aria-live="polite">{plural('admin.providers.count', page?.totalElements || 0)}</p>
          <TableWrap label={t('admin.providers.tableLabel')} busy={list.loading}>
            <table className="table admin-table">
              <caption className="sr-only">{t('admin.providers.tableLabel')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.providers.colBusiness')}</th>
                  <th scope="col">{t('admin.providers.colOwner')}</th>
                  <th scope="col">{t('admin.providers.colCatalogue')}</th>
                  <th scope="col">{t('admin.providers.colRating')}</th>
                  <th scope="col">{t('admin.providers.colStatus')}</th>
                  <th scope="col">{t('admin.common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="adm-cell-main">
                      <span className="adm-cell-title">{p.businessName}</span>
                      <span className="adm-cell-sub">{[p.category?.name, [p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}</span>
                      <span className="adm-cell-sub">{t('admin.providers.joinedOn', { date: fmt.date(p.createdAt) })}</span>
                    </th>
                    <td>
                      <span className="adm-cell-title">{p.ownerName || '—'}</span>
                      {p.ownerEmail ? <span className="adm-cell-sub">{p.ownerEmail}</span> : null}
                    </td>
                    <td className="adm-nowrap">
                      <span className="adm-cell-sub">{plural('admin.providers.servicesCount', p.services?.length || 0)}</span>
                      <span className="adm-cell-sub">{plural('admin.providers.staffCount', p.staff?.length || 0)}</span>
                    </td>
                    <td className="adm-nowrap">
                      {p.reviewCount ? t('admin.providers.ratingValue', { rating: fmt.decimal(p.rating), count: fmt.number(p.reviewCount) }) : t('admin.providers.noRating')}
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>
                      <button type="button" className={`btn btn-xs ${p.status === 'PENDING' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setSelected(p)} aria-label={`${p.status === 'PENDING' ? t('admin.providers.review') : t('admin.providers.details')}: ${p.businessName}`}>
                        {p.status === 'PENDING' ? t('admin.providers.review') : t('admin.providers.details')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={page?.page ?? filters.page} totalPages={page?.totalPages} onPage={(p) => setFilters({ page: p })} />
        </DataState>
      </TabPanel>

      {selected ? <ProviderDialog provider={selected} onClose={() => setSelected(null)} onDecided={onDecided} /> : null}
    </AdminLayout>
  );
}

function Kv({ label, children }) {
  return (
    <>
      <dt className="k">{label}</dt>
      <dd>{children || '—'}</dd>
    </>
  );
}

/** Full provider profile with the decision form. */
export function ProviderDialog({ provider: p, onClose, onDecided }) {
  const t = useT();
  const fmt = useAdminFormat();
  const toast = useToast();
  const noteRef = useRef(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const policy = p.policy || {};
  const services = p.services || [];
  const staff = p.staff || [];
  const branches = p.branches || [];
  const options = DECISIONS[p.status] || ['VERIFIED'];

  const decide = async (next) => {
    setError('');
    if (needsNote(next) && !note.trim()) {
      setNoteError(t('admin.providers.noteRequired'));
      noteRef.current?.focus();
      return;
    }
    setNoteError('');
    setBusy(next);
    try {
      const updated = await decideProvider(p.id, next, note);
      toast(t(`admin.providers.decided.${next}`, { name: p.businessName }), 'success');
      onDecided(updated);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(null);
    }
  };

  const minutes = (n) => t('admin.providers.minutes', { n: fmt.number(n) });
  const limit = (n) => (n > 0 ? fmt.number(n) : t('admin.providers.unlimited'));

  return (
    <Modal title={p.businessName} onClose={onClose} wide closeDisabled={Boolean(busy)}>
      <div className="adm-provider-head">
        <StatusBadge status={p.status} />
        {p.status === 'VERIFIED'
          ? <Link to={`/providers/${p.id}`} className="link-more">{t('admin.providers.publicProfile')} <span aria-hidden="true">&rarr;</span></Link>
          : <span className="hint">{t('admin.providers.notPublic')}</span>}
      </div>
      {p.adminNote ? <p className="form-note"><strong>{t('admin.providers.adminNote')}:</strong>&nbsp;{p.adminNote}</p> : null}

      <h3 className="admin-h3">{t('admin.providers.business')}</h3>
      <dl className="kv">
        <Kv label={t('admin.providers.description')}>{p.description}</Kv>
        <Kv label={t('admin.providers.specialty')}>{p.specialty}</Kv>
        <Kv label={t('admin.providers.category')}>{p.category ? `${p.category.icon ? `${p.category.icon} ` : ''}${p.category.name}` : null}</Kv>
        <Kv label={t('admin.providers.address')}>{[p.address, p.city, p.state, p.country].filter(Boolean).join(', ')}</Kv>
        <Kv label={t('admin.providers.phone')}>{p.phone}</Kv>
        <Kv label={t('admin.providers.website')}>
          {p.website ? <a href={/^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer">{p.website}</a> : null}
        </Kv>
        <Kv label={t('admin.providers.timezone')}>{p.timezone}</Kv>
        <Kv label={t('admin.providers.owner')}>{[p.ownerName, p.ownerEmail].filter(Boolean).join(' · ')}</Kv>
        <Kv label={t('admin.providers.joined')}>{fmt.date(p.createdAt)}</Kv>
      </dl>

      <h3 className="admin-h3">{t('admin.providers.policy')}</h3>
      <dl className="kv">
        <Kv label={t('admin.providers.slotInterval')}>{policy.slotIntervalMin > 0 ? minutes(policy.slotIntervalMin) : t('admin.providers.slotAuto')}</Kv>
        <Kv label={t('admin.providers.maxPerDay')}>{limit(policy.maxBookingsPerDay)}</Kv>
        <Kv label={t('admin.providers.maxPerSlot')}>{limit(policy.maxBookingsPerSlot)}</Kv>
        <Kv label={t('admin.providers.minNotice')}>{minutes(policy.minNoticeMin || 0)}</Kv>
        <Kv label={t('admin.providers.advance')}>{t('admin.providers.days', { n: fmt.number(policy.maxAdvanceBookingDays || 0) })}</Kv>
        <Kv label={t('admin.providers.autoConfirm')}>{policy.autoConfirm ? t('admin.common.yes') : t('admin.common.no')}</Kv>
        <Kv label={t('admin.providers.cancelCutoff')}>{t('admin.providers.hoursBefore', { n: fmt.number(policy.cancellationCutoffHours || 0) })}</Kv>
        <Kv label={t('admin.providers.lateRefund')}>{fmt.percent(policy.lateCancelRefundPercent || 0)}</Kv>
        <Kv label={t('admin.providers.rescheduleCutoff')}>{t('admin.providers.hoursBefore', { n: fmt.number(policy.rescheduleCutoffHours || 0) })}</Kv>
        <Kv label={t('admin.providers.maxReschedules')}>{limit(policy.maxReschedules)}</Kv>
        <Kv label={t('admin.providers.cancellationPolicy')}>{policy.cancellationPolicy}</Kv>
      </dl>

      <h3 className="admin-h3">{t('admin.providers.services', { count: fmt.number(services.length) })}</h3>
      {services.length === 0 ? <p className="hint">{t('admin.providers.noServices')}</p> : (
        <ul className="plain-list adm-detail-list">
          {services.map((s) => (
            <li key={s.id}>
              <span className="adm-cell-title">{s.name}{!s.active ? <span className="badge badge-muted adm-cell-tag">{t('admin.providers.inactive')}</span> : null}</span>
              <span className="adm-cell-sub">{[minutes(s.durationMin), fmt.money(s.price), t(`admin.modes.${s.mode || 'IN_PERSON'}`)].join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="admin-h3">{t('admin.providers.staff', { count: fmt.number(staff.length) })}</h3>
      {staff.length === 0 ? <p className="hint">{t('admin.providers.noStaff')}</p> : (
        <ul className="plain-list adm-detail-list">
          {staff.map((m) => (
            <li key={m.id}>
              <span className="adm-cell-title">{m.name}{!m.active ? <span className="badge badge-muted adm-cell-tag">{t('admin.providers.inactive')}</span> : null}</span>
              {m.designation ? <span className="adm-cell-sub">{m.designation}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {branches.length > 0 ? (
        <>
          <h3 className="admin-h3">{t('admin.providers.branches', { count: fmt.number(branches.length) })}</h3>
          <ul className="plain-list adm-detail-list">
            {branches.map((b) => (
              <li key={b.id}>
                <span className="adm-cell-title">{b.name}{b.main ? <span className="badge badge-brand adm-cell-tag">{t('admin.providers.mainBranch')}</span> : null}</span>
                <span className="adm-cell-sub">{[b.address, b.city].filter(Boolean).join(', ')}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="adm-decision">
        <h3 className="admin-h3">{t('admin.providers.decision')}</h3>
        <div className="field">
          <label htmlFor={`note-${p.id}`}>{t('admin.providers.note')}</label>
          <textarea ref={noteRef} id={`note-${p.id}`} rows={3} maxLength={NOTE_MAX} value={note}
            onChange={(e) => { setNote(e.target.value); if (noteError) setNoteError(''); }}
            aria-invalid={noteError ? true : undefined} aria-describedby={`note-${p.id}-hint${noteError ? ` note-${p.id}-error` : ''}`} />
          <span id={`note-${p.id}-hint`} className="hint">{t('admin.providers.noteHint', { max: NOTE_MAX })}</span>
          {noteError ? <span id={`note-${p.id}-error`} className="hint error-text" role="alert">{noteError}</span> : null}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="adm-dialog-actions">
          {options.map((next) => (
            <button key={next} type="button" disabled={Boolean(busy)} onClick={() => decide(next)}
              className={`btn ${next === 'VERIFIED' ? 'btn-success' : 'adm-btn-danger'}`}>
              {busy === next ? t('admin.common.working') : decisionLabel(t, p.status, next)}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
