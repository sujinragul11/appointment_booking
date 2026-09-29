import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import ProviderCard from '../components/ProviderCard';
import Loader from '../components/Loader';

const PAGE_SIZE = 9;

function findCategory(categories, name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  return categories.find((c) => String(c.name || '').toLowerCase() === needle || String(c.slug || '').toLowerCase() === needle) || null;
}

/**
 * Provider search. The URL is the source of truth:
 *   /providers?q=&city=&categoryId=&minRating=&sort=&page=
 * plus ?category=<name> (home page chips) and legacy ?cat=<id>, both resolved to categoryId.
 */
export default function ProvidersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const city = params.get('city') || '';
  const categoryId = params.get('categoryId') || params.get('cat') || '';
  const categoryName = params.get('category') || '';
  const minRating = params.get('minRating') || '';
  const sort = params.get('sort') || 'rating';
  const page = Math.max(0, parseInt(params.get('page'), 10) || 0);

  const [categories, setCategories] = useState(null);
  const [qInput, setQInput] = useState(q);
  const [cityInput, setCityInput] = useState(city);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const pushed = useRef({ q, city });
  const requestId = useRef(0);

  const update = useCallback((changes, { replace = false } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      });
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace });
  }, [setParams]);

  useEffect(() => {
    api.get('/categories')
      .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCategories([]));
  }, []);

  // ?category=<name> -> ?categoryId=<id>. An unknown name falls back to a text search.
  useEffect(() => {
    if (!categoryName || categories === null) return;
    const match = findCategory(categories, categoryName);
    if (match) update({ category: null, cat: null, categoryId: match.id }, { replace: true });
    else update({ category: null, q: q || categoryName }, { replace: true });
  }, [categoryName, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL changed from outside (back/forward, links): reflect it in the text boxes.
  useEffect(() => {
    if (q !== pushed.current.q) { pushed.current.q = q; setQInput(q); }
    if (city !== pushed.current.city) { pushed.current.city = city; setCityInput(city); }
  }, [q, city]);

  // Typing searches after a short pause instead of on every keystroke.
  useEffect(() => {
    if (qInput === q && cityInput === city) return undefined;
    const timer = setTimeout(() => {
      pushed.current = { q: qInput, city: cityInput };
      update({ q: qInput, city: cityInput }, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [qInput, cityInput]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (categoryName) return; // wait until the name is resolved to an id
    const id = ++requestId.current;
    const search = { sort, page, size: PAGE_SIZE };
    if (q.trim()) search.q = q.trim();
    if (city.trim()) search.city = city.trim();
    if (categoryId) search.categoryId = categoryId;
    if (minRating) search.minRating = minRating;
    setLoading(true);
    setError('');
    api.get('/providers', { params: search })
      .then((r) => { if (id === requestId.current) setData(r.data); })
      .catch((e) => { if (id === requestId.current) setError(getErrorMessage(e, 'Could not load providers')); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [q, city, categoryId, categoryName, minRating, sort, page, attempt]);

  const selectedCategory = categories?.find((c) => String(c.id) === String(categoryId));
  const hasFilters = Boolean(q || city || categoryId || minRating);
  const content = data?.content || [];

  const goPage = (p) => {
    update({ page: p || null });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="container page">
      <h1 style={{ fontSize: '1.9rem', fontWeight: 800 }}>Browse providers</h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        {selectedCategory ? `${selectedCategory.name} providers` : q ? `Providers matching "${q}"` : 'Verified professionals ready to help'}
      </p>

      <form className="card card-pad mt-3 filter-bar" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="pf-q" className="sr-only">Search providers</label>
        <input id="pf-q" type="search" className="filter-control filter-grow" placeholder="Search name, city or service"
          value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <label htmlFor="pf-cat" className="sr-only">Category</label>
        <select id="pf-cat" className="filter-control" value={categoryId}
          onChange={(e) => update({ categoryId: e.target.value, cat: null })}>
          <option value="">All categories</option>
          {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <label htmlFor="pf-city" className="sr-only">City</label>
        <input id="pf-city" className="filter-control" style={{ width: 150 }} placeholder="City" value={cityInput}
          onChange={(e) => setCityInput(e.target.value)} autoComplete="address-level2" />
        <label htmlFor="pf-rating" className="sr-only">Minimum rating</label>
        <select id="pf-rating" className="filter-control" value={minRating} onChange={(e) => update({ minRating: e.target.value })}>
          <option value="">Any rating</option>
          <option value="4">4+ stars</option>
          <option value="3">3+ stars</option>
        </select>
        <label htmlFor="pf-sort" className="sr-only">Sort by</label>
        <select id="pf-sort" className="filter-control" value={sort}
          onChange={(e) => update({ sort: e.target.value === 'rating' ? null : e.target.value })}>
          <option value="rating">Top rated</option>
          <option value="reviewCount">Most reviewed</option>
          <option value="newest">Newest</option>
          <option value="name">Name A-Z</option>
        </select>
        {hasFilters && (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => update({ q: null, city: null, categoryId: null, cat: null, minRating: null })}>
            Clear filters
          </button>
        )}
      </form>

      <p className="sr-only" role="status">
        {loading ? 'Searching…' : data ? `${data.totalElements ?? content.length} providers found` : ''}
      </p>

      {error ? (
        <div className="form-error mt-3" role="alert">
          {error}{' '}
          <button type="button" className="btn btn-outline btn-xs" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      ) : !data ? (
        <div className="mt-3"><Loader /></div>
      ) : content.length === 0 ? (
        <div className="empty mt-3">
          <div className="empty-ico" aria-hidden="true">{'\u{1F50D}'}</div>
          <h2 style={{ fontSize: '1.2rem' }}>No providers found</h2>
          <p className="mt-1">Try adjusting your search filters.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-3 mt-3" aria-busy={loading} style={{ opacity: loading ? 0.6 : 1 }}>
            {content.map((p) => <ProviderCard key={p.id} p={p} />)}
          </div>
          {data.totalPages > 1 && (
            <nav className="pager mt-4" aria-label="Pagination">
              <button type="button" className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => goPage(page - 1)}>&larr; Prev</button>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                Page {(data.page ?? page) + 1} of {data.totalPages} ({data.totalElements} providers)
              </span>
              <button type="button" className="btn btn-outline btn-sm" disabled={page + 1 >= data.totalPages} onClick={() => goPage(page + 1)}>Next &rarr;</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
