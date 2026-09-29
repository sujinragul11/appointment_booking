import { useState } from 'react';
import api, { getErrorMessage } from '../../../api/client';
import Modal from '../../../components/Modal';
import { InlineLoader } from '../../../components/Loader';
import { useT } from '../../../i18n';
import { tp } from '../../../utils/plural';

const COMMENT_MAX = 2000;

/** FR-41, FR-42: rate a completed appointment (1-5 stars) with an optional comment. */
export default function ReviewDialog({ appt, onDone, onClose }) {
  const t = useT();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/reviews', { appointmentId: appt.id, rating, comment: comment.trim() || null });
      onDone(data);
    } catch (err) {
      setError(getErrorMessage(err, t('site.review.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('site.review.title')} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit}>
        <p className="hint mb-2">{t('site.review.for', { service: appt.serviceName, provider: appt.providerName })}</p>
        <fieldset className="plain-fieldset field">
          <legend className="field-label">{t('site.review.rating')}</legend>
          <div className="star-radios">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={`star-label ${n <= rating ? 'on' : ''}`}>
                <input type="radio" name="review-rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="star-input" />
                <span className="star-glyph" aria-hidden="true">&#9733;</span>
                <span className="sr-only">{tp(t, 'site.review.starsLabel', { count: n })}</span>
              </label>
            ))}
          </div>
          <span className="hint" aria-live="polite">{t(`site.review.level.${rating}`)}</span>
        </fieldset>
        <div className="field">
          <label htmlFor="review-comment">{t('site.review.comment')} <span className="optional">({t('common.optional')})</span></label>
          <textarea id="review-comment" rows={4} maxLength={COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={t('site.review.placeholder')} aria-describedby="review-moderation" />
          <span className="hint" id="review-moderation">{t('site.review.moderation')}</span>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <InlineLoader label={t('site.review.submitting')} /> : t('site.review.submit')}
        </button>
      </form>
    </Modal>
  );
}
