import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import VerifyCode from '../components/VerifyCode';
import Loader, { InlineLoader } from '../components/Loader';
import { useT } from '../i18n';
import { homePathFor } from '../utils/routes';

const CODE_RE = /^[0-9]{6}$/;

/**
 * E-mail verification from the link in the verification e-mail (/verify?email=...).
 * Signed in as that address: the authenticated flow (POST /auth/verify, can resend).
 * Otherwise: e-mail + code (POST /auth/verify-otp).
 */
export default function VerifyEmail() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, loading, updateUser } = useAuth();
  const [params] = useSearchParams();
  const emailParam = (params.get('email') || '').trim();

  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  if (loading) return <Loader />;

  const ownAddress = user && (!emailParam || emailParam.toLowerCase() === String(user.email).toLowerCase());

  if (ownAddress) {
    const verified = user.emailVerified || user.verified;
    return (
      <div className="container page auth-page">
        <div className="card card-pad auth-card">
          <h1 className="auth-title">{t('site.verifyPage.title')}</h1>
          {verified ? (
            <>
              <p className="form-note" role="status">{t('site.verifyPage.already')}</p>
              <Link className="btn btn-primary mt-2" to={homePathFor(user.role)}>{t('site.verifyPage.continue')}</Link>
            </>
          ) : (
            <VerifyCode channel="EMAIL" destination={user.email} alreadySent showTitle={false}
              onVerified={(u) => {
                updateUser(u);
                toast(t('site.verify.done'), 'success');
                navigate(homePathFor(u.role), { replace: true });
              }} />
          )}
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const otp = code.replace(/\s/g, '');
    if (!CODE_RE.test(otp)) {
      setError(t('site.verify.codeFormat'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { email: email.trim(), otp });
      setDone(data?.message || t('site.verify.done'));
    } catch (err) {
      setError(getErrorMessage(err, t('site.verify.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page auth-page">
      <div className="card card-pad auth-card">
        <h1 className="auth-title">{t('site.verifyPage.title')}</h1>
        {done ? (
          <>
            <p className="form-success" role="status">{done}</p>
            <Link className="btn btn-primary mt-2" to="/login" state={{ email: email.trim() }}>{t('auth.signIn')}</Link>
          </>
        ) : (
          <>
            <p className="auth-lead">{t('site.verifyPage.lead')}</p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="verify-email">{t('auth.email')}</label>
                <input id="verify-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email" placeholder={t('auth.emailPlaceholder')} />
              </div>
              <div className="field">
                <label htmlFor="verify-code">{t('site.verify.codeLabel')}</label>
                <input id="verify-code" className="code-input" value={code} required
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                  aria-describedby="verify-code-hint" />
                <span className="hint" id="verify-code-hint">{t('site.verify.codeHint')}</span>
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
                {busy ? <InlineLoader label={t('site.verify.verifying')} /> : t('site.verify.submit')}
              </button>
            </form>
            <p className="auth-foot mt-3">
              {t('site.verifyPage.needCode')} <Link to={`/login?next=${encodeURIComponent('/verify')}`}>{t('site.verifyPage.signInToResend')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
