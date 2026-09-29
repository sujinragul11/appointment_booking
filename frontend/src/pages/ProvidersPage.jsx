import { useEffect, useRef, useState } from 'react';
import api, { getErrorMessage } from '../api/client';
import ProviderCard from '../components/ProviderCard';
import Pager from '../components/Pager';
import { InlineLoader } from '../components/Loader';
import { useT } from '../i18n';
import { todayISO } from '../utils/format';
import { pageParam, useDebouncedField, useUrlFilters } from '../hooks/useUrlFilters';
import { tp } from '../utils/plural';

const PAGE_SIZE = 9;
const SORTS = ['rating', 'reviews', 'newest', 'name'];
const MODES = ['IN_PERSON', 'ONLINE'];

function findCategory(categories, name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  return categories.find((c) => String(c.name || '').toLowerCase() === needle || String(c.slug || '').toLowerCase() === needle) || null;
}

const sortOf = (params) => {
  const s = params.get('sort');
  if (s === 'reviewCount') return 'reviews';
  return SORTS.includes(s) ? s : 'rating';
};

/** Maps URL parameters to the GET /providers query. Exported for tests. */
export function providersQuery(params) {
  const query = { page: pageParam(params), size: PAGE_SIZE, sort: sortOf(params) };
  ['q', 'city'].forEach((k) => { const v = (params.get(k) || '').trim(); if (v) query[k] = v; });
  const categoryId = params.get('categoryId') || params.get('cat');
  if (/^\d+$/.test(categoryId || '')) query.categoryId = categoryId;
  const minRating = params.get('minRating');
  if (minRating && Number(minRating) > 0) query.minRating = Number(minRating);
  ['minPrice', 'maxPrice'].forEach((k) => {
    const v = params.get(k);
    if (v !== null && v !== '' && Number(v) >= 0) query[k] = Number(v);
  });
  const date = params.get('date');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) query.date = date;
  const mode = params.get('mode');
  if (MODES.includes(mode)) query.mode = mode;
  return query;
}

/**
 * Provider search (FR-19, FR-49). The URL is the source of truth:
 *   /providers?q=&category=|categoryId=&city=&minRating=&minPrice=&maxPrice=&date=&mode=&sort=&page=
 * ?category=<name> (home page chips) and legacy ?cat=<id> are resolved to categoryId.
 */
export default function ProvidersPage() {
  const t = useT();
  const [params, update] = useUrlFilters();
  const categoryName = params.get('category') || '';
  const [categories, setCategories] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);

  const [q, setQ] = useDebouncedField(params.get('q') || '', (v) => update({ q: v.trim() }, { replace: true }));
  const [city, setCity] = useDebouncedField(params.get('city') || '', (v) => update({ city: v.trim() }, { replace: true }));
  const [minPrice, setMinPrice] = useDebouncedField(params.get('minPrice') || '', (v) => update({ minPrice: v }, { replace: true }));
  const [maxPrice, setMaxPrice] = useDebouncedField(params.get('maxPrice') || '', (v) => update({ maxPrice: v }, { replace: true }));

  const query = providersQuery(params);
  const queryKey = JSON.stringify(query);

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
    else update({ category: null, q: params.get('q') || categoryName }, { replace: true });
  }, [categoryName, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (categoryName) return; // wait until the name is resolved to an id
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    api.get('/providers', { params: JSON.parse(queryKey) })
      .then((r) => { if (id === requestId.current) setData(r.data); })
      .catch((e) => { if (id === requestId.current) setError(getErrorMessage(e, t('site.providers.loadFailed'))); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [queryKey, categoryName, attempt, t]);

  const selectedCategory = categories?.find((c) => String(c.id) === String(query.categoryId || ''));
  const hasFilters = ['q', 'city', 'categoryId', 'cat', 'minRating', 'minPrice', 'maxPrice', 'date', 'mode'].some((k) => params.get(k));
  const content = data?.content || [];
  const priceProblem = minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice);

  const clear = () => update({ q: null, city: null, categoryId: null, cat: null, minRating: null, minPrice: null, maxPrice: null, date: null, mode: null });
  const goPage = (p) => {
    update({ page: p || null });
    window.scrollTo({ top: 0 });
  };

  const lead = selectedCategory ? t('site.providers.leadCategory', { name: selectedCategory.name })
    : query.q ? t('site.providers.leadQuery', { q: query.q }) : t('site.providers.lead');

  return (
    <div className="container page">
      <h1 className="page-title">{t('site.providers.title')}</h1>
      <p className="page-lead">{lead}</p>

      <form className="card card-pad mt-3 filter-grid" role="search" aria-label={t('site.providers.filters')}
        onSubmit={(e) => e.preventDefault()}>
        <div className="field filter-wide">
          <label htmlFor="pf-q">{t('site.filters.search')}</label>
          <input id="pf-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('site.providers.searchPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="pf-cat">{t('site.filters.category')}</label>
          <select id="pf-cat" value={query.categoryId || ''} onChange={(e) => update({ categoryId: e.target.value, cat: null })}>
            <option value="">{t('site.filters.allCategories')}</option>
            {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-city">{t('site.filters.city')}</label>
          <input id="pf-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2"
            placeholder={t('site.filters.cityPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="pf-rating">{t('site.filters.minRating')}</label>
          <select id="pf-rating" value={query.minRating ? String(query.minRating) : ''} onChange={(e) => update({ minRating: e.target.value })}>
            <option value="">{t('site.filters.anyRating')}</option>
            {['4.5', '4', '3'].map((r) => <option key={r} value={r}>{t('site.filters.ratingAtLeast', { value: r })}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-min">{t('site.filters.minPrice')}</label>
          <input id="pf-min" type="number" inputMode="numeric" min="0" step="50" value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)} aria-describedby={priceProblem ? 'pf-price-error' : undefined} />
        </div>
        <div className="field">
          <label htmlFor="pf-max">{t('site.filters.maxPrice')}</label>
          <input id="pf-max" type="number" inputMode="numeric" min="0" step="50" value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)} aria-invalid={priceProblem || undefined}
            aria-describedby={priceProblem ? 'pf-price-error' : undefined} />
        </div>
        <div className="field">
          <label htmlFor="pf-date">{t('site.filters.availableOn')}</label>
          <input id="pf-date" type="date" min={todayISO()} value={query.date || ''} onChange={(e) => update({ date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pf-mode">{t('site.filters.mode')}</label>
          <select id="pf-mode" value={query.mode || ''} onChange={(e) => update({ mode: e.target.value })}>
            <option value="">{t('site.filters.anyMode')}</option>
            {MODES.map((m) => <option key={m} value={m}>{t(`site.mode.${m}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-sort">{t('site.filters.sort')}</label>
          <select id="pf-sort" value={query.sort} onChange={(e) => update({ sort: e.target.value === 'rating' ? null : e.target.value })}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`site.providers.sort.${s}`)}</option>)}
          </select>
        </div>
        {hasFilters && (
          <div className="filter-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>{t('site.filters.clear')}</button>
          </div>
        )}
        {priceProblem && <p className="hint error-text filter-full" id="pf-price-error">{t('site.filters.priceOrder')}</p>}
      </form>

      <p className="results-status" role="status" aria-live="polite">
        {loading ? t('site.filters.searching') : data ? tp(t, 'site.providers.found', { count: data.totalElements ?? content.length }) : ''}
      </p>

      {error ? (
        <div className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="btn btn-outline btn-xs" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</button>
        </div>
      ) : !data ? (
        <p className="muted-line"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
      ) : content.length === 0 ? (
        <div className="empty card card-pad">
          <div className="empty-ico" aria-hidden="true">{'\u{1F50D}'}</div>
          <h2 className="empty-title">{t('site.providers.none')}</h2>
          <p className="mt-1">{t('site.filters.tryAdjusting')}</p>
          {hasFilters && <button type="button" className="btn btn-outline mt-2" onClick={clear}>{t('site.filters.clear')}</button>}
        </div>
      ) : (
        <>
          <ul className="grid grid-3 plain-grid card-grid" aria-busy={loading || undefined} style={{ opacity: loading ? 0.6 : 1 }}>
            {content.map((p) => <li key={p.id}><ProviderCard p={p} headingLevel={2} /></li>)}
          </ul>
          <Pager page={data.page ?? query.page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={goPage} />
        </>
      )}
    </div>
  );
}
