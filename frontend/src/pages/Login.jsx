import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../api/client';
import { useT } from '../i18n';
import { homePathFor, nextFromLocation } from '../utils/routes';

const DEMOS = [
  ['Customer', 'customer@booking.com', 'Customer@123', 'Rajesh Kumar'],
  ['Admin', 'admin@booking.com', 'Admin@123', 'Platform Admin']
];

const PROVIDERS = [
  ['Smile Dental Clinic', 'provider@booking.com', 'Provider@123'],
  ['Glow & Glam Salon', 'salon@booking.com', 'Salon@123'],
  ['CareWell Physiotherapy', 'physio@booking.com', 'Physio@123'],
  ['Bright Minds Tutoring', 'tutor@booking.com', 'Tutor@123'],
  ['Perfect Skin Clinic', 'skin@booking.com', 'Skin@123'],
  ['Nova Fitness Studio', 'fitness@booking.com', 'Fitness@123']
];

export default function Login() {
  const { login } = useAuth();
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const next = nextFromLocation(location);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      const key = user.role === 'ADMIN' ? 'auth.welcomeAdmin' : user.role === 'PROVIDER' ? 'auth.welcomeProvider' : 'auth.welcomeBack';
      toast(t(key, { name: user.name }), 'success');
      navigate(next || homePathFor(user.role), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, t('auth.invalidCredentials')));
    } finally {
      setBusy(false);
    }
  };

  const registerLink = next ? `/register?next=${encodeURIComponent(next)}` : '/register';

  return (
    <div className="container page" style={{ maxWidth: 480 }}>
      <div className="card card-pad" style={{ boxShadow: 'var(--shadow)' }}>
        <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>{t('auth.loginTitle')}</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{t('auth.loginText')}</p>

        {location.state?.sessionExpired && !error && <div className="form-note" role="status">{t('auth.sessionExpired')}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">{t('auth.email')}</label>
            <input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="login-password">{t('auth.password')}</label>
            <input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" />
          </div>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit">
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <div className="divider-h" />
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.92rem' }}>
          {t('auth.newHere')} <Link to={registerLink}>{t('auth.createAccountLink')}</Link>
        </p>
      </div>

      <div className="demo-accounts mt-3">
        <strong style={{ color: 'var(--brand-700)' }}>{t('auth.demoTitle')}</strong>
        <p className="mt-1" style={{ color: 'var(--ink-2)' }}>{t('auth.demoText')}</p>
        <div className="mt-1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEMOS.map(([role, em, pw]) => (
            <button key={role} type="button" className="chip"
              onClick={() => { setEmail(em); setPassword(pw); }}>
              {role}: <code style={{ marginLeft: 6 }}>{em}</code>
            </button>
          ))}
        </div>
        <div className="divider-h my-2" />
        <p className="mt-1" style={{ color: 'var(--ink-2)' }}>{t('auth.demoProviders')}</p>
        <div className="mt-1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PROVIDERS.map(([name, em, pw]) => (
            <button key={em} type="button" className="chip"
              onClick={() => { setEmail(em); setPassword(pw); }}>
              {name} <code style={{ marginLeft: 6 }}>{em}</code>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
