import { useEffect, useRef, useState } from 'react';
import api, { getErrorMessage } from '../../../api/client';
import Modal from '../../../components/Modal';
import { InlineLoader } from '../../../components/Loader';
import { useI18n } from '../../../i18n';
import { formatMoney } from '../../../utils/format';
import { formatInstant } from '../../../utils/bookingCalendar';
import { tp } from '../../../utils/plural';

const REASON_MAX = 500;

/**
 * Cancel (customer, admin) or reject / cancel (provider, staff) with a required reason (FR-29, FR-30).
 * The policy check comes from GET /appointments/{id}/cancellation-preview: whether it is
 * allowed, the refund percentage and amount, and the free-cancellation cut-off.
 * Customers and admins cancel with DELETE /appointments/{id}; the business uses
 * PUT /appointments/{id}/status { status: 'CANCELLED', reason } (always a full refund).
 */
export default function CancelDialog({ appt, actor = 'CUSTOMER', reject = false, onDone, onClose }) {
  const { t, locale } = useI18n();
  const business = actor === 'BUSINESS';
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reasonRef = useRef(null);

  useEffect(() => {
    let active = true;
    api.get(`/appointments/${appt.id}/cancellation-preview`)
      .then((r) => { if (active) setPreview(r.data); })
      .catch((e) => { if (active) setPreviewError(getErrorMessage(e, t('site.cancel.previewFailed'))); });
    return () => { active = false; };
  }, [appt.id, t]);

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    setError('');
    const text = reason.trim();
    if (!text) {
      reasonRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const { data } = business
        ? await api.put(`/appointments/${appt.id}/status`, { status: 'CANCELLED', reason: text })
        : await api.delete(`/appointments/${appt.id}`, { data: { reason: text } });
      onDone(data);
    } catch (err) {
      setError(getErrorMessage(err, t('site.cancel.failed')));
    } finally {
      setBusy(false);
    }
  };

  const title = reject ? t('site.cancel.rejectTitle') : t('site.cancel.title');
  const blocked = preview && !preview.allowed;
  const missing = tried && !reason.trim();

  return (
    <Modal title={title} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate>
        <p className="hint mb-2">{t('site.cancel.booking', { ref: appt.bookingRef, service: appt.serviceName })}</p>

        <section className="policy-box" aria-labelledby="cancel-policy-title" aria-busy={!preview && !previewError}>
          <h3 id="cancel-policy-title" className="policy-box-title">{t('site.cancel.policyTitle')}</h3>
          {previewError ? (
            <p className="error-text" role="alert">{previewError}</p>
          ) : !preview ? (
            <p className="muted-line"><InlineLoader label={t('site.cancel.checking')} /> {t('site.cancel.checking')}</p>
          ) : (
            <div role="status">
              <p className={preview.allowed ? 'policy-message' : 'policy-message error-text'}>{preview.message}</p>
              <dl className="kv mt-1">
                {preview.paidAmount > 0 ? (
                  <>
                    <dt className="k">{t('site.cancel.paidOnline')}</dt><dd>{formatMoney(preview.paidAmount)}</dd>
                    <dt className="k">{t('site.cancel.refund')}</dt>
                    <dd><strong>{t('site.cancel.refundValue', { amount: formatMoney(preview.refundAmount), pct: preview.refundPercent })}</strong></dd>
                  </>
                ) : (
                  <><dt className="k">{t('site.cancel.refund')}</dt><dd>{t('site.cancel.nothingPaid')}</dd></>
                )}
                {actor === 'CUSTOMER' && preview.cutoffAt && (
                  <>
                    <dt className="k">{Date.parse(preview.cutoffAt) < Date.now() ? t('site.cancel.cutoffPassed') : t('site.cancel.cutoff')}</dt>
                    <dd>{t('site.cancel.cutoffValue', { time: formatInstant(preview.cutoffAt, locale, appt.timezone), hours: preview.cutoffHours })}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </section>

        <div className="field mt-2">
          <label htmlFor="cancel-reason">{reject ? t('site.cancel.rejectReason') : t('site.cancel.reason')} <span className="required-mark">({t('site.common.required')})</span></label>
          <textarea id="cancel-reason" ref={reasonRef} rows={3} maxLength={REASON_MAX} value={reason} required aria-required="true"
            onChange={(e) => setReason(e.target.value)} placeholder={business ? t('site.cancel.businessPlaceholder') : t('site.cancel.placeholder')}
            aria-invalid={missing || undefined} aria-describedby={missing ? 'cancel-reason-error cancel-reason-count' : 'cancel-reason-count'} />
          {missing && <span className="hint error-text" id="cancel-reason-error">{t('site.cancel.reasonRequired')}</span>}
          <span className="hint" id="cancel-reason-count">{tp(t, 'site.common.charsLeft', { count: REASON_MAX - reason.length })}</span>
        </div>
        {business && <p className="hint mb-2">{t('site.cancel.businessNote')}</p>}

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="btn-row">
          <button type="submit" className="btn btn-danger" disabled={busy || blocked || Boolean(previewError && !business)}>
            {busy ? <InlineLoader label={t('site.cancel.cancelling')} /> : reject ? t('site.cancel.rejectSubmit') : t('site.cancel.submit')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('site.cancel.keep')}</button>
        </div>
      </form>
    </Modal>
  );
}
