import { useEffect, useId, useRef, useState } from 'react';
import api, { getErrorMessage } from '../api/client';
import { useT } from '../i18n';
import { InlineLoader } from './Loader';

const CODE_RE = /^[0-9]{6}$/;

/**
 * Verify the signed-in user's e-mail or phone with a 6-digit code (FR-2):
 * POST /auth/send-verification { channel } and POST /auth/verify { channel, code }.
 * `alreadySent`: a code was just sent (e.g. by registration), so only "Resend" is offered.
 * `autoSend`: request a code as soon as this is shown. `onVerified(user)` gets the updated user.
 */
export default function VerifyCode({
  channel = 'EMAIL', destination, alreadySent = false, autoSend = false, onVerified, onCancel, headingLevel = 2, showTitle = true
}) {
  const t = useT();
  const id = useId();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(alreadySent);
  const [info, setInfo] = useState(alreadySent ? t('site.verify.sentTo', { to: destination || '' }) : '');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const autoSent = useRef(false);
  const inputRef = useRef(null);
  const Heading = `h${headingLevel}`;

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const { data } = await api.post('/auth/send-verification', { channel });
      setSent(true);
      setInfo(data?.message || t('site.verify.sent'));
      inputRef.current?.focus();
    } catch (e) {
      if (e?.response?.status === 429) {
        // A code was sent less than a minute ago: it is still valid.
        setSent(true);
        setInfo(getErrorMessage(e, t('site.verify.wait')));
      } else {
        setError(getErrorMessage(e, t('site.verify.sendFailed')));
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (autoSend && !alreadySent && !autoSent.current) {
      autoSent.current = true;
      send();
    }
  }, [autoSend, alreadySent]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    const clean = code.replace(/\s/g, '');
    if (!CODE_RE.test(clean)) {
      setError(t('site.verify.codeFormat'));
      inputRef.current?.focus();
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const { data } = await api.post('/auth/verify', { channel, code: clean });
      setCode('');
      if (onVerified) onVerified(data);
    } catch (err) {
      setError(getErrorMessage(err, t('site.verify.failed')));
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const what = channel === 'PHONE' ? t('site.verify.phone') : t('site.verify.email');

  return (
    <div className="verify-box">
      {showTitle && <Heading className="verify-title">{t('site.verify.title', { what })}</Heading>}
      {!sent && (
        <p className="verify-text">
          {channel === 'PHONE' ? t('site.verify.phoneText') : t('site.verify.emailText')}
          {destination ? <> <strong className="break-all">{destination}</strong></> : null}
        </p>
      )}
      <div aria-live="polite" className="verify-status">
        {info && <p className="form-note">{info}</p>}
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {sent ? (
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-code`}>{t('site.verify.codeLabel')}</label>
            <input id={`${id}-code`} ref={inputRef} className="code-input" value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              aria-describedby={`${id}-hint`} aria-invalid={Boolean(error) || undefined} required />
            <span className="hint" id={`${id}-hint`}>{t('site.verify.codeHint')}</span>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={verifying}>
              {verifying ? <InlineLoader label={t('site.verify.verifying')} /> : t('site.verify.submit')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={send} disabled={sending}>
              {sending ? <InlineLoader label={t('site.verify.sending')} /> : t('site.verify.resend')}
            </button>
            {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('site.verify.later')}</button>}
          </div>
        </form>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? <InlineLoader label={t('site.verify.sending')} /> : t('site.verify.send')}
          </button>
          {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('site.verify.later')}</button>}
        </div>
      )}
    </div>
  );
}
