import { useId, useState } from 'react';
import { catalogApi } from '../../../api/provider';
import { getErrorMessage } from '../../../api/client';
import { useT } from '../../../i18n';

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Image picker that uploads immediately (POST /uploads) and reports the stored URL.
 * The native file input stays keyboard-focusable inside a button-styled label.
 */
export default function ImageUpload({ label, value, onChange, hint, shape = 'wide', disabled = false }) {
  const t = useT();
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus('');
    if (file.type && !TYPES.includes(file.type)) {
      setError(t('provider.upload.badType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('provider.upload.tooLarge'));
      return;
    }
    setBusy(true);
    setError('');
    setStatus(t('provider.upload.uploading'));
    try {
      const res = await catalogApi.upload(file);
      onChange(res.url);
      setStatus(t('provider.upload.done'));
    } catch (err) {
      setStatus('');
      setError(getErrorMessage(err, t('provider.upload.failed')));
    } finally {
      setBusy(false);
    }
  };

  const labelId = `${uid}-label`;
  const btnId = `${uid}-btn`;
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;

  return (
    <div className="field pp-upload">
      <span className="field-label" id={labelId}>{label}</span>
      <div className="pp-upload-row">
        <div className={`pp-upload-preview ${shape}`}>
          {value ? <img src={value} alt={t('provider.upload.previewAlt', { label })} /> : <span>{t('provider.upload.none')}</span>}
        </div>
        <div className="pp-upload-actions">
          <label className={`btn btn-outline btn-sm pp-file-btn ${busy || disabled ? 'is-disabled' : ''}`}>
            <input type="file" className="pp-file-input" accept={TYPES.join(',')} onChange={onFile} disabled={busy || disabled}
              aria-labelledby={`${labelId} ${btnId}`} aria-describedby={error ? `${errId} ${hintId}` : hintId}
              aria-invalid={error ? true : undefined} />
            <span id={btnId}>{busy ? t('provider.upload.uploading') : value ? t('provider.upload.replace') : t('provider.upload.choose')}</span>
          </label>
          {value && !busy ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(''); setStatus(t('provider.upload.removed')); }} disabled={disabled}>
              {t('provider.upload.remove')}<span className="sr-only"> {label}</span>
            </button>
          ) : null}
        </div>
      </div>
      {error ? <span className="hint error-text" id={errId}>{error}</span> : null}
      <span className="hint" id={hintId}>{hint || t('provider.upload.hint')}</span>
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
    </div>
  );
}
