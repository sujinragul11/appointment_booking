import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import PasswordStrength from '../components/PasswordStrength';
import VerifyCode from '../components/VerifyCode';
import { InlineLoader } from '../components/Loader';
import api, { getErrorMessage } from '../api/client';
import { useT } from '../i18n';
import { checkPassword } from '../utils/password';
import { homePathFor, nextFromLocation } from '../utils/routes';

// Same rule as the backend's RegisterRequest: optional +, then 10-15 digits.
const PHONE_RE = /^\+?[0-9]{10,15}$/;
const cleanPhone = (v) => String(v || '').replace(/[\s()-]/g, '');

export default function Register() {
  const { register, updateUser } = useAuth();
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = nextFromLocation(location);

  const [role, setRole] = useState(params.get('role') === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER');
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
  const [registered, setRegistered] = useState(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const verifyHeading = useRef(null);

  const pw = checkPassword(password);
  const phoneValue = cleanPhone(phone);
  const phoneInvalid = phoneValue !== '' && !PHONE_RE.test(phoneValue);

  useEffect(() => {
    if (role === 'PROVIDER' && categories.length === 0) {
      api.get('/categories').then((r) => setCategories(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [role, categories.length]);

  useEffect(() => {
    if (registered) verifyHeading.current?.focus();
  }, [registered]);

  const finish = (user) => navigate(next || homePathFor(user?.role), { replace: true });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setTriedSubmit(true);
    if (phoneInvalid) {
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
      name: name.trim(), email: email.trim(), password, role,
      ...(phoneValue ? { phone: phoneValue } : {}),
      ...(role === 'PROVIDER' ? { businessName: businessName.trim(), categoryId: categoryId ? Number(categoryId) : null } : {})
    };
    try {
      // AuthContext stores the tokens returned by /auth/register; an e-mail code is on its way.
      const data = await register(payload);
      if (data?.accessToken && data?.user) {
        toast(t('auth.accountCreated'), 'success');
        if (data.user.verified || data.user.emailVerified) finish(data.user);
        else setRegistered(data.user);
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

  if (registered) {
    return (
      <div className="container page auth-page">
        <div className="card card-pad auth-card">
          <h1 ref={verifyHeading} tabIndex={-1} className="auth-title">{t('site.register.verifyTitle')}</h1>
          <p className="auth-lead">{t('site.register.verifyLead')}</p>
          <VerifyCode channel="EMAIL" destination={registered.email} alreadySent showTitle={false}
            onVerified={(user) => {
              updateUser(user);
              toast(t('site.verify.done'), 'success');
              finish(user);
            }}
            onCancel={() => finish(registered)} />
          {registered.role === 'PROVIDER' && <p className="form-note mt-2">{t('auth.providerNote')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="container page auth-page auth-page-wide">
      <div className="card card-pad auth-card">
        <h1 className="auth-title">{t('auth.registerTitle')}</h1>
        <p className="auth-lead">{t('auth.registerText')}</p>

        <div className="chip-row mb-3" role="group" aria-label={t('auth.accountType')}>
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
            <input id="reg-name" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.namePlaceholder')} autoComplete="name" />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="reg-email">{t('auth.email')}</label>
              <input id="reg-email" type="email" required maxLength={150} value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')} autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="reg-phone">{t('auth.phone')} <span className="optional">({t('common.optional')})</span></label>
              <input id="reg-phone" ref={phoneRef} type="tel" inputMode="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder={t('auth.phonePlaceholder')} autoComplete="tel"
                aria-describedby="reg-phone-hint" aria-invalid={(triedSubmit && phoneInvalid) || undefined} />
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
                <input id="reg-business" required maxLength={120} value={businessName} onChange={(e) => setBusinessName(e.target.value)}
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

          <p className="hint mb-2">{t('site.register.verifyNote')}</p>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit">
            {busy ? <><InlineLoader label={t('auth.creatingAccount')} /> {t('auth.creatingAccount')}</> : t('auth.createAccount')}
          </button>
        </form>

        <p className="auth-foot mt-3">
          {t('auth.haveAccount')} <Link to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>{t('auth.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
