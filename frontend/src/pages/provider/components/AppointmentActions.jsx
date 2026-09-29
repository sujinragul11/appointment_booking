import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { getErrorMessage } from '../../../api/client';
import { appointmentApi, providerApi } from '../../../api/provider';
import { useT } from '../../../i18n';
import { formatMoney } from '../../../utils/format';
import { canCollect, withPayment } from '../lib/schedule';

/**
 * Provider / staff actions for one appointment, driven by the server's `actions` flags:
 * confirm, reject (pending) or cancel (confirmed) with a required reason, complete, no-show,
 * and — for providers — record money collected at the venue. `onUpdated` gets the new row.
 */
export default function AppointmentActions({ appt, onUpdated, allowCollect = false, showDetails = true, size = 'xs' }) {
  const t = useT();
  const toast = useToast();
  const reasonId = useId();
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null); // 'reject' | 'cancel' | 'noShow' | 'collect'
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [dialogError, setDialogError] = useState('');

  const actions = appt.actions || {};
  const ref = appt.bookingRef;
  const btn = `btn btn-${size}`;
  const collectible = allowCollect && canCollect(appt);
  const cancelKind = actions.canReject ? 'reject' : actions.canCancel ? 'cancel' : null;

  const run = async (key, request, message) => {
    setBusy(key);
    setDialogError('');
    try {
      const updated = await request();
      onUpdated?.(updated);
      toast(message, 'success');
      setDialog(null);
    } catch (err) {
      const msg = getErrorMessage(err, t('provider.actions.failed'));
      if (dialog) setDialogError(msg);
      else toast(msg, 'error');
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status, message, withReason) => run(status,
    () => appointmentApi.setStatus(appt.id, status, withReason ? reason.trim() : undefined), message);

  const openDialog = (kind) => {
    setReason('');
    setReasonError('');
    setDialogError('');
    setDialog(kind);
  };

  const submitCancel = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setReasonError(t('provider.actions.reasonRequired'));
      document.getElementById(reasonId)?.focus();
      return;
    }
    setStatus('CANCELLED', t(dialog === 'reject' ? 'provider.actions.rejected' : 'provider.actions.cancelled', { ref }), true);
  };

  const collect = () => run('collect', async () => withPayment(appt, await providerApi.collect(appt.id)),
    t('provider.actions.collected', { amount: formatMoney(appt.payment?.balanceDue), ref }));

  const sr = <span className="sr-only"> {ref}</span>;
  const anything = actions.canConfirm || actions.canComplete || actions.canMarkNoShow || collectible || cancelKind || showDetails;
  if (!anything) return null;

  return (
    <div className="pp-actions">
      {actions.canConfirm && (
        <button type="button" className={`${btn} btn-success`} disabled={Boolean(busy)}
          onClick={() => setStatus('CONFIRMED', t('provider.actions.confirmed', { ref }))}>
          {busy === 'CONFIRMED' ? t('provider.common.working') : t('provider.actions.confirm')}{sr}
        </button>
      )}
      {actions.canComplete && (
        <button type="button" className={`${btn} btn-primary`} disabled={Boolean(busy)}
          onClick={() => setStatus('COMPLETED', t('provider.actions.completed', { ref }))}>
          {busy === 'COMPLETED' ? t('provider.common.working') : t('provider.actions.complete')}{sr}
        </button>
      )}
      {actions.canMarkNoShow && (
        <button type="button" className={`${btn} btn-outline`} disabled={Boolean(busy)} onClick={() => openDialog('noShow')}>
          {t('provider.actions.noShow')}{sr}
        </button>
      )}
      {collectible && (
        <button type="button" className={`${btn} btn-outline`} disabled={Boolean(busy)} onClick={() => openDialog('collect')}>
          {t('provider.actions.collect')}{sr}
        </button>
      )}
      {cancelKind && (
        <button type="button" className={`${btn} btn-danger-outline`} disabled={Boolean(busy)} onClick={() => openDialog(cancelKind)}>
          {t(cancelKind === 'reject' ? 'provider.actions.reject' : 'provider.actions.cancel')}{sr}
        </button>
      )}
      {showDetails && (
        <Link to={`/appointments/${appt.id}`} className={`${btn} btn-ghost`}>
          {t('provider.actions.details')}{sr}
        </Link>
      )}

      {(dialog === 'reject' || dialog === 'cancel') && (
        <Modal title={t(dialog === 'reject' ? 'provider.actions.rejectTitle' : 'provider.actions.cancelTitle', { ref })}
          onClose={() => setDialog(null)} closeDisabled={Boolean(busy)} closeOnBackdrop={false}>
          <form onSubmit={submitCancel} noValidate>
            <p className="pp-dialog-text">{t('provider.actions.cancelNote')}</p>
            <div className="field">
              <label htmlFor={reasonId}>{t('provider.actions.reasonLabel')}<span className="pp-req" aria-hidden="true"> *</span></label>
              <textarea id={reasonId} rows={3} maxLength={500} value={reason} required aria-required="true"
                aria-invalid={reasonError ? true : undefined} aria-describedby={`${reasonId}-hint${reasonError ? ` ${reasonId}-err` : ''}`}
                onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(''); }} />
              {reasonError && <span className="hint error-text" id={`${reasonId}-err`}>{reasonError}</span>}
              <span className="hint" id={`${reasonId}-hint`}>{t('provider.actions.reasonHint')}</span>
            </div>
            {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
            <div className="pp-dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)} disabled={Boolean(busy)}>{t('provider.common.back')}</button>
              <button type="submit" className="btn btn-danger" disabled={Boolean(busy)}>
                {busy ? t('provider.common.working') : t(dialog === 'reject' ? 'provider.actions.rejectSubmit' : 'provider.actions.cancelSubmit')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === 'noShow' && (
        <Modal title={t('provider.actions.noShowTitle', { ref })} onClose={() => setDialog(null)} closeDisabled={Boolean(busy)}>
          <p className="pp-dialog-text">{t('provider.actions.noShowText', { name: appt.customerName || '' })}</p>
          {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
          <div className="pp-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)} disabled={Boolean(busy)}>{t('provider.common.back')}</button>
            <button type="button" className="btn btn-danger" disabled={Boolean(busy)}
              onClick={() => setStatus('NO_SHOW', t('provider.actions.markedNoShow', { ref }))}>
              {busy ? t('provider.common.working') : t('provider.actions.noShowSubmit')}
            </button>
          </div>
        </Modal>
      )}

      {dialog === 'collect' && (
        <Modal title={t('provider.actions.collectTitle', { ref })} onClose={() => setDialog(null)} closeDisabled={Boolean(busy)}>
          <p className="pp-dialog-text">
            {t('provider.actions.collectText', { amount: formatMoney(appt.payment?.balanceDue), name: appt.customerName || '' })}
          </p>
          {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
          <div className="pp-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)} disabled={Boolean(busy)}>{t('provider.common.back')}</button>
            <button type="button" className="btn btn-success" disabled={Boolean(busy)} onClick={collect}>
              {busy ? t('provider.common.working') : t('provider.actions.collectSubmit')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
