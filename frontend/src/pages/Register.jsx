import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import PasswordStrength from '../components/PasswordStrength';
import api, { getErrorMessage } from '../api/client';
import { useT } from '../i18n';
import { checkPassword } from '../utils/password';
import { homePathFor, nextFromLocation } from '../utils/routes';

// Same rule as the backend's RegisterRequest: optional +, then 10-15 digits.
const PHONE_RE = /^\+?[0-9]{10,15}$/;

export default function Register() {
  const { register } = useAuth();
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER';
  const next = nextFromLocation(location);

  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);

  const pw = checkPassword(password);

  useEffect(() => {
    if (role === 'PROVIDER') api.get('/categories').then((r) => setCategories(r.data || [])).catch(() => {});
  }, [role]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setTriedSubmit(true);
    const cleanPhone = phone.replace(/[\s()-]/g, '');
    if (!PHONE_RE.test(cleanPhone)) {
      setError(t('auth.phoneInvalid'));
      phoneRef.current?.focus();
      return;
    }
    if (!pw.valid) {
      setError(t('auth.weakPassword'));
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    const payload = {
      name: name.trim(), email: email.trim(), phone: cleanPhone, password, role,
      ...(role === 'PROVIDER' ? { businessName, categoryId: categoryId ? Number(categoryId) : null } : {})
    };
    try {
      // AuthContext stores the tokens returned by /auth/register; no second login round-trip.
      const data = await register(payload);
      if (data?.accessToken && data?.user) {
        toast(`${t('auth.accountCreated')}${data.message ? ` — ${data.message}` : ''}`, 'success');
        navigate(next || homePathFor(data.user.role), { replace: true });
      } else {
        toast(t('auth.accountCreatedSignIn'), 'success');
        navigate(next ? `/login?next=${encodeURIComponent(next)}` : '/login', { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err, t('auth.registrationFailed')));
    } finally {
      setBusy(false);
    }
  };

  const phoneInvalid = triedSubmit && !PHONE_RE.test(phone.replace(/[\s()-]/g, ''));

  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <div className="card card-pad" style={{ boxShadow: 'var(--shadow)' }}>
        <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>{t('auth.registerTitle')}</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{t('auth.registerText')}</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }} role="group" aria-label={t('auth.accountType')}>
          {['CUSTOMER', 'PROVIDER'].map((r) => (
            <button key={r} type="button" className={`chip ${role === r ? 'active' : ''}`} aria-pressed={role === r}
              onClick={() => setRole(r)}>
              {r === 'CUSTOMER' ? t('auth.asCustomer') : t('auth.asProvider')}
            </button>
          ))}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="reg-name">{t('auth.fullName')}</label>
            <input id="reg-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.namePlaceholder')} autoComplete="name" />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="reg-email">{t('auth.email')}</label>
              <input id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')} autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="reg-phone">{t('auth.phone')}</label>
              <input id="reg-phone" ref={phoneRef} type="tel" inputMode="tel" required value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder={t('auth.phonePlaceholder')} autoComplete="tel"
                aria-describedby="reg-phone-hint" aria-invalid={phoneInvalid || undefined} />
              <span className="hint" id="reg-phone-hint">{t('auth.phoneHint')}</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="reg-password">{t('auth.password')}</label>
            <input id="reg-password" ref={passwordRef} type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.newPasswordPlaceholder')}
              autoComplete="new-password" aria-describedby="reg-password-strength"
              aria-invalid={(triedSubmit && !pw.valid) || undefined} />
            <PasswordStrength password={password} id="reg-password-strength" />
          </div>

          {role === 'PROVIDER' && (
            <>
              <div className="field">
                <label htmlFor="reg-business">{t('auth.businessName')}</label>
                <input id="reg-business" required value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t('auth.businessPlaceholder')} autoComplete="organization" />
              </div>
              <div className="field">
                <label htmlFor="reg-category">{t('auth.category')}</label>
                <select id="reg-category" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t('auth.selectCategory')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-note">
                <span aria-hidden="true">{'ℹ'}</span>
                <span>{t('auth.providerNote')}</span>
              </div>
            </>
          )}

          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit">
            {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 18, color: 'var(--muted)', fontSize: '0.92rem' }}>
          {t('auth.haveAccount')} <Link to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>{t('auth.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
