import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../api/client';
import api from '../api/client';

export default function Register() {
  const { register, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER';

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

  useEffect(() => {
    if (role === 'PROVIDER') api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
  }, [role]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = {
      name, email, phone, password, role,
      ...(role === 'PROVIDER' ? { businessName, categoryId: categoryId ? Number(categoryId) : null } : {})
    };
    try {
      const res = await register(payload);
      toast(`Account created${res.message ? ` — ${res.message}` : ''}`, 'success');
      const user = await login(email, password);
      if (user.role === 'PROVIDER') navigate('/dashboard/provider', { replace: true });
      else navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <div className="card card-pad" style={{ boxShadow: 'var(--shadow)' }}>
        <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>Create your account</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Join Sloto in under a minute.</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
          {['CUSTOMER', 'PROVIDER'].map((r) => (
            <button key={r} type="button" className={`chip ${role === r ? 'active' : ''}`}
              onClick={() => setRole(r)}>
              I'm a {r === 'CUSTOMER' ? 'Customer' : 'Service Provider'}
            </button>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label>Full name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="row">
            <div className="field">
              <label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>

          {role === 'PROVIDER' && (
            <>
              <div className="field">
                <label>Business name</label>
                <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Smile Dental Clinic" />
              </div>
              <div className="field">
                <label>Category</label>
                <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-note">
                <span>{'\u2139'}</span>
                <span>Provider accounts need admin approval before appearing in search results.</span>
              </div>
            </>
          )}

          <button className="btn btn-primary btn-block btn-lg" disabled={busy} type="submit">
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 18, color: 'var(--muted)', fontSize: '0.92rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}