import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';

export default function CategoriesPage() {
  const [categories, setCategories] = useState(null);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data || [])).catch(() => setCategories([]));
  }, []);

  return (
    <div className="container page">
      <h1 style={{ fontSize: '1.9rem', fontWeight: 800 }}>Browse by category</h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>Pick a category to discover the best nearby professionals</p>

      {!categories ? (
        <div className="mt-3"><Loader /></div>
      ) : categories.length === 0 ? (
        <div className="empty mt-3"><p>No categories yet.</p></div>
      ) : (
        <div className="grid grid-3 mt-3">
          {categories.map((c) => (
            <Link key={c.id} to={`/providers?categoryId=${c.id}`} className="card card-pad card-hover">
              <div className="provider-logo" style={{ marginTop: 0, width: 56, height: 56, fontSize: '1.6rem' }} aria-hidden="true">{c.icon || '✦'}</div>
              <h2 style={{ marginTop: 14, fontSize: '1.15rem' }}>{c.name}</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Find and book professional services</p>
              <span className="link-more mt-2" style={{ display: 'inline-block' }}>Explore &rarr;</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
