import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import ProviderCard from '../components/ProviderCard';

const QUICK = [
  { icon: '\u2695', name: 'Doctor' },
  { icon: '\u2637', name: 'Dentist' },
  { icon: '\u2726', name: 'Salon & Spa' },
  { icon: '\u269A', name: 'Fitness' },
  { icon: '\u270E', name: 'Tutor' },
  { icon: '\u2666', name: 'Consultant' }
];

export default function Home() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [top, setTop] = useState([]);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/providers?page=0&size=6').then((r) => setTop(r.data.content)).catch(() => {});
  }, []);

  const search = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (city) params.set('city', city);
    navigate(`/providers?${params.toString()}`);
  };

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>
            Book trusted pros at your<br />convenience with <span className="grad-text">Sloto</span>
          </h1>
          <p>Skip queues and calls. Search verified providers nearby or wherever you want to be — and book appointments in seconds.</p>

          <form className="search-panel" onSubmit={search}>
            <input placeholder="What do you need? e.g. dental, salon, tutor..." value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            <div className="divider" />
            <input placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" />
            <button className="btn btn-primary" type="submit">Search</button>
          </form>

          <div className="mt-4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.88rem', paddingTop: 8 }}>Popular:</span>
            {QUICK.map((c) => (
              <Link key={c.name} to={`/providers?category=${encodeURIComponent(c.name)}`} className="chip">
                <span>{c.icon}</span> {c.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container page" style={{ paddingTop: 44 }}>
        <div className="section-title">
          <div>
            <h2>Browse categories</h2>
            <p>Explore services offered by our verified partners</p>
          </div>
          <Link to="/categories" className="link-more">View all &rarr;</Link>
        </div>
        <div className="grid grid-4">
          {categories.slice(0, 8).map((c) => (
            <Link key={c.id} to={`/providers?cat=${c.id}`} className="card card-pad card-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="provider-logo" style={{ marginTop: 0, fontSize: 0 }}>
                <span style={{ fontSize: '1.4rem' }}>{c.icon || '\u2726'}</span>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Book instantly</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="section-title mt-4" style={{ marginTop: 56 }}>
          <div>
            <h2>Top rated providers</h2>
            <p>Highest rated by customers like you</p>
          </div>
          <Link to="/providers" className="link-more">See all &rarr;</Link>
        </div>
        {top.length > 0 ? (
          <div className="grid grid-3">
            {top.map((p) => <ProviderCard key={p.id} p={p} />)}
          </div>
        ) : (
          <p className="empty" style={{ padding: '30px 0' }}>
            <span className="empty-ico">{'\u{1F50D}'}</span><br />No providers yet. Check back soon!
          </p>
        )}
      </section>

      <section style={{ background: 'var(--gradient)', color: '#fff', padding: '64px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>Are you a service provider?</h2>
          <p style={{ opacity: 0.92, marginBottom: 24 }}>List your business, manage staff &amp; availability, and grow your customer base.</p>
          <Link to="/register?role=PROVIDER" className="btn" style={{ background: '#fff', color: 'var(--brand-600)' }}>Become a partner</Link>
        </div>
      </section>
    </>
  );
}