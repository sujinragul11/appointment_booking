import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../api/client';

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
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

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
      toast(`${user.role === 'ADMIN' ? 'Welcome admin' : user.role === 'PROVIDER' ? 'Welcome back, provider' : 'Welcome back'}, ${user.name}!`, 'success');
      const from = location.state?.from;
      if (from) navigate(from, { replace: true });
      else if (user.role === 'ADMIN') navigate('/dashboard/admin', { replace: true });
      else if (user.role === 'PROVIDER') navigate('/dashboard/provider', { replace: true });
      else navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid credentials'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 480 }}>
      <div className="card card-pad" style={{ boxShadow: 'var(--shadow)' }}>
        <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>Welcome back</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Sign in to manage your bookings.</p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password" autoComplete="current-password" />
          </div>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit">
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="divider-h" />
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.92rem' }}>
          New to Sloto? <Link to="/register">Create an account</Link>
        </p>
      </div>

      <div className="demo-accounts mt-3">
        <strong style={{ color: 'var(--brand-700)' }}>Demo accounts</strong>
        <p className="mt-1" style={{ color: 'var(--ink-2)' }}>One-click test logins — each provider has its own dashboard:</p>
        <div className="mt-1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEMOS.map(([role, em, pw]) => (
            <button key={role} type="button" className="chip"
              onClick={() => { setEmail(em); setPassword(pw); }}>
              {role}: <code style={{ marginLeft: 6 }}>{em}</code>
            </button>
          ))}
        </div>
        <div className="divider-h my-2" />
        <p className="mt-1" style={{ color: 'var(--ink-2)' }}>Providers:</p>
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