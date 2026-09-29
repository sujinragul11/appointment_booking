import { useState } from 'react';
import Modal from '../../../components/Modal';
import { InlineLoader } from '../../../components/Loader';
import { useT } from '../../../i18n';

/** Asks before an action that cannot be undone; `onConfirm` may return a promise. */
export default function ConfirmDialog({ title, text, confirmLabel, danger = false, onConfirm, onClose }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (e) {
      setError(e?.message || t('site.common.failed'));
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} closeDisabled={busy}>
      <p>{text}</p>
      {error && <div className="form-error mt-2" role="alert">{error}</div>}
      <div className="btn-row mt-3">
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={run} disabled={busy}>
          {busy ? <InlineLoader label={t('site.common.working')} /> : confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
      </div>
    </Modal>
  );
}
