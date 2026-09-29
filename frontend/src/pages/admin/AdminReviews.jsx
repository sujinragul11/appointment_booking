import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { fetchReviews, moderateReview } from '../../api/admin';
import AdminLayout from './AdminLayout';
import { ConfirmDialog, DataState, Pager, TabPanel, Tabs } from './adminUi';
import { useAdminFormat, useLoader, usePlural, useUrlFilters } from './adminHooks';

const PAGE_SIZE = 20;
const DEFAULTS = { filter: 'PENDING', page: 0 };
const TABS = ['PENDING', 'FLAGGED', 'APPROVED', 'REJECTED', 'ALL'];
const NOTE_MAX = 500;
const STATUS_BADGE = { PENDING: 'badge-amber', APPROVED: 'badge-success', REJECTED: 'badge-danger' };

/** What a moderator can do with a review in its current state. */
export function reviewActions(review) {
  if (review.flagged || review.status === 'PENDING') return ['APPROVED', 'REJECTED'];
  return review.status === 'APPROVED' ? ['REJECTED'] : ['APPROVED'];
}

function Stars({ rating }) {
  const t = useT();
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <span className="adm-review-stars">
      <span aria-hidden="true">{'★'.repeat(value)}<span className="adm-review-stars-off">{'★'.repeat(5 - value)}</span></span>
      <span className="sr-only">{t('admin.reviews.stars', { rating: value })}</span>
    </span>
  );
}

/** Reviews moderation (FR-42): pending / flagged / approved / rejected queues with approve or reject + note. */
export default function AdminReviews() {
  const t = useT();
  const fmt = useAdminFormat();
  const plural = usePlural();
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const filter = TABS.includes(filters.filter) ? filters.filter : 'PENDING';
  const list = useLoader(() => fetchReviews({ filter, page: filters.page, size: PAGE_SIZE }), `${filter}|${filters.page}`);
  const [pending, setPending] = useState(null); // { review, status }

  const page = list.data;
  const reviews = Array.isArray(page?.content) ? page.content : [];
  const emptyTitle = filter === 'PENDING' ? t('admin.reviews.emptyPending') : filter === 'FLAGGED' ? t('admin.reviews.emptyFlagged') : t('admin.reviews.empty');

  return (
    <AdminLayout title={t('admin.reviews.title')} subtitle={t('admin.reviews.subtitle')}>
      <Tabs idBase="adm-review-queue" label={t('admin.reviews.tabs')} value={filter}
        tabs={TABS.map((key) => ({ key, label: t(`admin.reviews.tab.${key}`) }))}
        onChange={(next) => setFilters({ filter: next })} />
      <TabPanel idBase="adm-review-queue" value={filter} busy={list.loading}>
        <DataState loading={list.loading} error={list.error} hasData={Boolean(page)} onRetry={list.reload}
          empty={Boolean(page) && reviews.length === 0} emptyTitle={emptyTitle}>
          <p className="admin-count" aria-live="polite">{plural('admin.reviews.count', page?.totalElements || 0)}</p>
          <ul className={`plain-list adm-review-list ${list.loading ? 'adm-refreshing' : ''}`}>
            {reviews.map((r) => (
              <li key={r.id}>
                <article className="card card-pad adm-review-card" aria-labelledby={`adm-review-${r.id}-title`}>
                  <header className="adm-review-head">
                    <h2 id={`adm-review-${r.id}-title`} className="adm-review-title">
                      {r.providerId ? <Link to={`/providers/${r.providerId}`}>{r.providerName}</Link> : r.providerName}
                    </h2>
                    <div className="adm-review-badges">
                      <span className={`badge ${STATUS_BADGE[r.status] || 'badge-muted'}`}>{t(`admin.reviewStatus.${r.status}`)}</span>
                      {r.flagged ? <span className="badge badge-red"><span aria-hidden="true">⚑ </span>{t('admin.reviews.flagged')}</span> : null}
                    </div>
                  </header>
                  <p className="adm-review-meta">
                    <Stars rating={r.rating} />
                    <span>{t('admin.reviews.by', { name: r.customerName || '—' })}</span>
                    <span>{fmt.dateTime(r.createdAt)}</span>
                    {r.appointmentId ? <Link to={`/appointments/${r.appointmentId}`}>{t('admin.reviews.booking')}</Link> : null}
                  </p>
                  {r.comment ? <blockquote className="adm-review-comment">{r.comment}</blockquote> : <p className="hint">{t('admin.reviews.noComment')}</p>}
                  {r.flagged ? (
                    <p className="adm-review-flag">{r.flagReason ? t('admin.reviews.flagReason', { reason: r.flagReason }) : t('admin.reviews.flaggedNoReason')}</p>
                  ) : null}
                  {r.moderationNote ? <p className="adm-review-note">{t('admin.reviews.moderationNote', { note: r.moderationNote })}</p> : null}
                  {r.reply ? (
                    <div className="adm-review-reply">
                      <span className="adm-review-reply-label">{t('admin.reviews.reply')}</span>
                      <p>{r.reply}</p>
                    </div>
                  ) : null}
                  <div className="adm-actions adm-review-actions">
                    {reviewActions(r).map((status) => (
                      <button key={status} type="button" className={`btn btn-sm ${status === 'APPROVED' ? 'btn-success' : 'btn-danger-outline'}`}
                        onClick={() => setPending({ review: r, status })}
                        aria-label={`${status === 'APPROVED' ? t('admin.reviews.approve') : t('admin.reviews.reject')}: ${t('admin.reviews.reviewOf', { name: r.customerName || '—', provider: r.providerName })}`}>
                        {status === 'APPROVED' ? t('admin.reviews.approve') : t('admin.reviews.reject')}
                      </button>
                    ))}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          <Pager page={page?.page ?? filters.page} totalPages={page?.totalPages} onPage={(p) => setFilters({ page: p })} />
        </DataState>
      </TabPanel>

      {pending ? (
        <ModerateDialog review={pending.review} status={pending.status} onClose={() => setPending(null)}
          onDone={() => { setPending(null); list.reload(); }} />
      ) : null}
    </AdminLayout>
  );
}

function ModerateDialog({ review, status, onClose, onDone }) {
  const t = useT();
  const toast = useToast();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approving = status === 'APPROVED';

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await moderateReview(review.id, status, note);
      toast(approving ? t('admin.reviews.approved') : t('admin.reviews.rejected'), 'success');
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog title={approving ? t('admin.reviews.approveTitle') : t('admin.reviews.rejectTitle')}
      confirmLabel={approving ? t('admin.reviews.approve') : t('admin.reviews.reject')} danger={!approving}
      onConfirm={confirm} onClose={onClose} busy={busy} error={error}>
      <p>{approving ? t('admin.reviews.approveText') : t('admin.reviews.rejectText')}</p>
      <figure className="adm-review-quote">
        <blockquote>{review.comment || t('admin.reviews.noComment')}</blockquote>
        <figcaption>{t('admin.reviews.reviewOf', { name: review.customerName || '—', provider: review.providerName })}</figcaption>
      </figure>
      <div className="field">
        <label htmlFor={noteId}>{t('admin.reviews.note')} <span className="hint">({t('admin.common.optional')})</span></label>
        <textarea id={noteId} rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${noteId}-hint`} />
        <span id={`${noteId}-hint`} className="hint">{approving ? t('admin.reviews.noteHintApprove') : t('admin.reviews.noteHintReject')}</span>
      </div>
    </ConfirmDialog>
  );
}
