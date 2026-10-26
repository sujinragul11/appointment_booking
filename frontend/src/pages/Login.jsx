import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import GoogleSignIn from '../components/GoogleSignIn';
import { InlineLoader } from '../components/Loader';
import api, { getErrorMessage, setTokens } from '../api/client';
import { useT } from '../i18n';
import { homePathFor, nextFromLocation } from '../utils/routes';

export default function Login() {
  const { login, updateUser } = useAuth();
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const next = nextFromLocation(location);

  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const welcome = (user) => {
    const key = user.role === 'ADMIN' ? 'auth.welcomeAdmin' : user.role === 'PROVIDER' ? 'auth.welcomeProvider' : 'auth.welcomeBack';
    toast(t(key, { name: user.name }), 'success');
    navigate(next || homePathFor(user.role), { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      welcome(await login(email.trim(), password));
    } catch (err) {
      // 401 wrong credentials, 423 locked after repeated failures, 403 deactivated: the server explains.
      setError({ status: err?.response?.status, message: getErrorMessage(err, t('auth.invalidCredentials')) });
    } finally {
      setBusy(false);
    }
  };

  const google = async (idToken) => {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/auth/google', { idToken });
      setTokens(data.accessToken, data.refreshToken);
      updateUser(data.user);
      welcome(data.user);
    } catch (err) {
      setError({ status: err?.response?.status, message: getErrorMessage(err, t('site.auth.googleFailed')) });
    } finally {
      setBusy(false);
    }
  };

  const registerLink = next ? `/register?next=${encodeURIComponent(next)}` : '/register';

  return (
    <div className="container page auth-page">
      <div className="card card-pad auth-card">
        <h1 className="auth-title">{t('auth.loginTitle')}</h1>
        <p className="auth-lead">{t('auth.loginText')}</p>

        {location.state?.sessionExpired && !error && <div className="form-note" role="status">{t('auth.sessionExpired')}</div>}
        {location.state?.notice && !error && <div className="form-note" role="status">{location.state.notice}</div>}
        {error && (
          <div className="form-error" role="alert">
            {error.message}
            {error.status === 423 && (
              <> {' '}<Link to="/forgot-password" state={{ email }}>{t('site.auth.resetInstead')}</Link></>
            )}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">{t('auth.email')}</label>
            <input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')} autoComplete="email" />
          </div>
          <div className="field">
            <div className="label-row">
              <label htmlFor="login-password">{t('auth.password')}</label>
              <Link to="/forgot-password" state={{ email }} className="small-link">{t('site.auth.forgot')}</Link>
            </div>
            <input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" />
          </div>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit">
            {busy ? <><InlineLoader label={t('auth.signingIn')} /> {t('auth.signingIn')}</> : t('auth.signIn')}
          </button>
        </form>

        <GoogleSignIn onCredential={google} disabled={busy} />

        <div className="divider-h" />
        <p className="auth-foot">
          {t('auth.newHere')} <Link to={registerLink}>{t('auth.createAccountLink')}</Link>
        </p>
      </div>
    </div>
  );
}
