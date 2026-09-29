import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import PasswordStrength from '../components/PasswordStrength';
import { InlineLoader } from '../components/Loader';
import { useT } from '../i18n';
import { checkPassword } from '../utils/password';

/** FR-4 / FR-8: choose a new password with the token from the reset link (/reset-password?token=...). */
export default function ResetPassword() {
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkProblem, setLinkProblem] = useState(false);
  const [done, setDone] = useState('');
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const pw = checkPassword(password);
  const mismatch = confirm !== '' && confirm !== password;

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    setError('');
    setLinkProblem(false);
    if (!pw.valid) {
      setError(t('auth.weakPassword'));
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirm) {
      setError(t('site.reset.mismatch'));
      confirmRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(data?.message || t('site.reset.done'));
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(getErrorMessage(err, t('site.reset.failed')));
      // Field validation errors come with an `errors` map; a bad or expired token does not.
      setLinkProblem(err?.response?.status === 400 && !err.response.data?.errors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page auth-page">
      <div className="card card-pad auth-card">
        <h1 className="auth-title">{t('site.reset.title')}</h1>
        {!token ? (
          <>
            <p className="form-error" role="alert">{t('site.reset.noToken')}</p>
            <Link className="btn btn-primary mt-2" to="/forgot-password">{t('site.reset.requestNew')}</Link>
          </>
        ) : done ? (
          <>
            <p className="form-success" role="status">{done}</p>
            <Link className="btn btn-primary mt-2" to="/login">{t('auth.signIn')}</Link>
          </>
        ) : (
          <>
            <p className="auth-lead">{t('site.reset.lead')}</p>
            {error && (
              <div className="form-error" role="alert">
                {error}{' '}
                {linkProblem && <Link to="/forgot-password">{t('site.reset.requestNew')}</Link>}
              </div>
            )}
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="reset-password">{t('site.reset.newPassword')}</label>
                <input id="reset-password" ref={passwordRef} type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                  aria-describedby="reset-password-strength" aria-invalid={(tried && !pw.valid) || undefined} />
                <PasswordStrength password={password} id="reset-password-strength" />
              </div>
              <div className="field">
                <label htmlFor="reset-confirm">{t('site.reset.confirm')}</label>
                <input id="reset-confirm" ref={confirmRef} type="password" required value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
                  aria-describedby={mismatch ? 'reset-confirm-error' : undefined} aria-invalid={mismatch || undefined} />
                {mismatch && <span className="hint error-text" id="reset-confirm-error">{t('site.reset.mismatch')}</span>}
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
                {busy ? <InlineLoader label={t('site.reset.saving')} /> : t('site.reset.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
