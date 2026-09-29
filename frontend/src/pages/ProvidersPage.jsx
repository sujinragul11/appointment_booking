import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import ProviderCard from '../components/ProviderCard';
import Loader from '../components/Loader';

export default function ProvidersPage() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') || '';
  const initialCity = params.get('city') || '';
  const initialCat = params.get('cat') ? Number(params.get('cat')) : null;
  const catName = params.get('category') || '';

  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState(initialQ);
  const [city, setCity] = useState(initialCity);
  const [catId, setCatId] = useState(initialCat);
  const [sort, setSort] = useState('rating');
  const [page, setPage] = useState(0);
  const [minRating, setMinRating] = useState('');

  const load = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (city) p.set('city', city);
    if (catId) p.set('categoryId', catId);
    if (minRating) p.set('minRating', minRating);
    p.set('sort', sort);
    p.set('page', page);
    p.set('size', 9);
    api.get(`/providers?${p.toString()}`).then((r) => setData(r.data)).catch(() => {});
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
  };

  useEffect(load, [q, city, catId, sort, page, minRating]);

  return (
    <div className="container page">
      <h1 style={{ fontSize: '1.9rem', fontWeight: 800 }}>Browse providers</h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>{catName ? `Providers matching "${catName}"` : 'Verified professionals ready to help'}</p>

      <div className="card card-pad mt-3" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="full-width" style={{ flex: 2, minWidth: 200, border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 14px', outline: 'none' }}
          placeholder="Search name, city or service" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 14px', outline: 'none', background: '#fff' }}
          value={catId || ''} onChange={(e) => { setCatId(e.target.value ? Number(e.target.value) : null); setPage(0); }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <input style={{ width: 150, border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 14px', outline: 'none' }}
          placeholder="City" value={city} onChange={(e) => { setCity(e.target.value); setPage(0); }} />
        <select style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 14px', outline: 'none', background: '#fff' }}
          value={minRating} onChange={(e) => { setMinRating(e.target.value); setPage(0); }}>
          <option value="">Any rating</option>
          <option value="4">4+ stars</option>
          <option value="3">3+ stars</option>
        </select>
        <select style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 14px', outline: 'none', background: '#fff' }}
          value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="rating">Top rated</option>
          <option value="reviewCount">Most reviewed</option>
          <option value="newest">Newest</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>

      {!data ? (
        <div className="mt-3"><Loader /></div>
      ) : data.content.length === 0 ? (
        <div className="empty mt-3">
          <div className="empty-ico">{'\u{1F50D}'}</div>
          <h3>No providers found</h3>
          <p className="mt-1">Try adjusting your search filters.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-3 mt-3">
            {data.content.map((p) => <ProviderCard key={p.id} p={p} />)}
          </div>
          {data.totalPages > 1 && (
            <div className="mt-4" style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>&larr; Prev</button>
              <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Page {data.page + 1} of {data.totalPages} ({data.totalElements} providers)
              </span>
              <button className="btn btn-outline btn-sm" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Next &rarr;</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}