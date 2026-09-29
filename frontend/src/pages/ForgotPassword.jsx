import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import { InlineLoader } from '../components/Loader';
import { useT } from '../i18n';

/**
 * FR-4: request a password reset link. The answer is always the same generic message, so
 * the page cannot be used to find out whether an address has an account.
 */
export default function ForgotPassword() {
  const t = useT();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(data?.message || t('site.forgot.sent'));
    } catch (err) {
      const status = err?.response?.status;
      // Validation problems and rate limits are worth showing; anything else still gets the generic answer.
      if (status === 400 || status === 429 || !err?.response) setError(getErrorMessage(err, t('site.forgot.failed')));
      else setSent(t('site.forgot.sent'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page auth-page">
      <div className="card card-pad auth-card">
        <h1 className="auth-title">{t('site.forgot.title')}</h1>
        {sent ? (
          <>
            <p className="form-success" role="status">{sent}</p>
            <p className="hint mt-2">{t('site.forgot.checkSpam')}</p>
            <div className="btn-row mt-3">
              <Link className="btn btn-primary" to="/login" state={{ email: email.trim() }}>{t('site.forgot.backToLogin')}</Link>
              <button type="button" className="btn btn-ghost" onClick={() => setSent('')}>{t('site.forgot.again')}</button>
            </div>
          </>
        ) : (
          <>
            <p className="auth-lead">{t('site.forgot.lead')}</p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="forgot-email">{t('auth.email')}</label>
                <input id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')} autoComplete="email" />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
                {busy ? <InlineLoader label={t('site.forgot.sending')} /> : t('site.forgot.submit')}
              </button>
            </form>
            <p className="auth-foot mt-3"><Link to="/login">{t('site.forgot.backToLogin')}</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
