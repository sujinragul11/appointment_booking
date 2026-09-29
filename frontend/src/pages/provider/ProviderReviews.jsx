import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { initials } from '../../utils/format';
import { ProviderShell, PageHead, ErrorState, EmptyState, SectionLoading } from './components/Shell';
import StatTile, { StatRow } from './components/StatTile';
import useLoad, { fieldErrorsOf } from './lib/useLoad';
import { fmtDateTime } from './lib/time';

const FILTERS = ['ALL', 'APPROVED', 'PENDING', 'REJECTED'];

function Stars({ rating, label }) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <span className="pp-stars" role="img" aria-label={label}>
      <span aria-hidden="true">{'★'.repeat(r)}<span className="pp-stars-off">{'★'.repeat(5 - r)}</span></span>
    </span>
  );
}

function ReplyForm({ review, onSaved, onCancel }) {
  const { t } = useI18n();
  const uid = useId();
  const [text, setText] = useState(review.reply || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) {
      setError(t('provider.reviews.replyRequired'));
      document.getElementById(uid)?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      onSaved(await providerApi.reply(review.id, text.trim()));
    } catch (err) {
      setError(fieldErrorsOf(err).reply || getErrorMessage(err, t('provider.common.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pp-reply-form" onSubmit={submit} noValidate>
      <label htmlFor={uid}>{t('provider.reviews.replyLabel', { name: review.customerName })}</label>
      <textarea id={uid} rows={3} maxLength={2000} value={text} autoFocus aria-invalid={error ? true : undefined}
        aria-describedby={`${uid}-hint${error ? ` ${uid}-err` : ''}`} onChange={(e) => { setText(e.target.value); setError(''); }} />
      {error && <span className="hint error-text" id={`${uid}-err`}>{error}</span>}
      <span className="hint" id={`${uid}-hint`}>{t('provider.reviews.replyHint')}</span>
      <div className="pp-reply-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? t('provider.common.saving') : t('provider.reviews.postReply')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>{t('provider.common.cancel')}</button>
      </div>
    </form>
  );
}

export default function ProviderReviews() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const reviewsQ = useLoad(() => providerApi.reviews(), []);
  const [filter, setFilter] = useState('ALL');
  const [replying, setReplying] = useState(null);
  const reviews = reviewsQ.data || [];
  const approved = reviews.filter((r) => r.status === 'APPROVED');
  const average = approved.length ? approved.reduce((s, r) => s + Number(r.rating || 0), 0) / approved.length : 0;
  const count = (f) => (f === 'ALL' ? reviews.length : reviews.filter((r) => r.status === f).length);
  const shown = filter === 'ALL' ? reviews : reviews.filter((r) => r.status === filter);

  const onSaved = (saved) => {
    reviewsQ.setData((list = []) => list.map((r) => (r.id === saved.id ? saved : r)));
    setReplying(null);
    toast(t('provider.reviews.replySaved'), 'success');
  };

  return (
    <ProviderShell>
      <PageHead title={t('provider.reviews.title')} lead={t('provider.reviews.lead')} />
      {reviewsQ.error ? <ErrorState error={reviewsQ.error} onRetry={reviewsQ.reload} /> : !reviewsQ.data ? <SectionLoading /> : (
        <>
          <StatRow label={t('provider.reviews.summary')}>
            <StatTile label={t('provider.reviews.average')} value={approved.length ? `${average.toFixed(1)} ★` : '—'}
              sub={t('provider.reviews.published', { count: approved.length })} />
            <StatTile label={t('provider.reviews.awaiting')} value={count('PENDING')} tone={count('PENDING') ? 'attention' : undefined} />
            <StatTile label={t('provider.reviews.unanswered')} value={reviews.filter((r) => !r.reply).length} />
          </StatRow>

          <div className="pp-seg pp-seg-wrap" role="group" aria-label={t('provider.reviews.filterLabel')}>
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {t(`provider.reviews.filters.${f}`)} ({count(f)})
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <EmptyState title={reviews.length ? t('provider.reviews.noneInFilter') : t('provider.reviews.none')}
              text={reviews.length ? null : t('provider.reviews.noneText')} />
          ) : (
            <ul className="pp-reviews">
              {shown.map((r) => (
                <li key={r.id} className="card card-pad pp-review">
                  <div className="pp-review-head">
                    <span className="avatar" aria-hidden="true">{r.customerPhoto ? <img src={r.customerPhoto} alt="" /> : initials(r.customerName)}</span>
                    <div className="pp-review-who">
                      <h2 className="pp-review-name">{r.customerName}</h2>
                      <span className="pp-muted">{fmtDateTime(r.createdAt, locale)}</span>
                    </div>
                    <Stars rating={r.rating} label={t('provider.reviews.stars', { count: r.rating })} />
                  </div>
                  <div className="pp-review-badges">
                    {r.status === 'PENDING' && <span className="badge badge-amber">{t('provider.reviews.statusPending')}</span>}
                    {r.status === 'REJECTED' && <span className="badge badge-red">{t('provider.reviews.statusRejected')}</span>}
                    {r.status === 'APPROVED' && <span className="badge badge-green">{t('provider.reviews.statusApproved')}</span>}
                    {r.flagged && <span className="badge badge-gray">{t('provider.reviews.flagged')}</span>}
                    <Link to={`/appointments/${r.appointmentId}`} className="pp-small-link">{t('provider.reviews.viewBooking')}</Link>
                  </div>
                  {r.comment ? <p className="pp-review-text">{r.comment}</p> : <p className="pp-muted">{t('provider.reviews.ratingOnly')}</p>}
                  {r.status === 'REJECTED' && r.moderationNote && <p className="pp-muted">{t('provider.reviews.moderationNote', { note: r.moderationNote })}</p>}
                  {replying === r.id ? (
                    <ReplyForm review={r} onSaved={onSaved} onCancel={() => setReplying(null)} />
                  ) : (
                    <>
                      {r.reply && (
                        <div className="pp-reply">
                          <span className="pp-reply-label">{t('provider.reviews.yourReply')}{r.replyAt ? ` · ${fmtDateTime(r.replyAt, locale)}` : ''}</span>
                          <p>{r.reply}</p>
                        </div>
                      )}
                      <button type="button" className="btn btn-outline btn-xs mt-1" onClick={() => setReplying(r.id)}>
                        {r.reply ? t('provider.reviews.editReply') : t('provider.reviews.reply')}
                        <span className="sr-only"> {t('provider.reviews.toName', { name: r.customerName })}</span>
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ProviderShell>
  );
}
