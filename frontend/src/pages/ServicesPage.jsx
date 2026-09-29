import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import Pager from '../components/Pager';
import ModeBadge from '../components/ModeBadge';
import { InlineLoader } from '../components/Loader';
import { useT } from '../i18n';
import { formatMoney } from '../utils/format';
import { pageParam, useDebouncedField, useUrlFilters } from '../hooks/useUrlFilters';
import { tp } from '../utils/plural';

const PAGE_SIZE = 12;
const SORTS = ['name', 'priceAsc', 'priceDesc', 'duration', 'rating', 'newest'];
const MODES = ['IN_PERSON', 'ONLINE'];

/** Maps URL parameters to the GET /services query. Exported for tests. */
export function servicesQuery(params) {
  const query = { page: pageParam(params), size: PAGE_SIZE };
  ['q', 'city'].forEach((k) => { const v = (params.get(k) || '').trim(); if (v) query[k] = v; });
  const categoryId = params.get('categoryId');
  if (/^\d+$/.test(categoryId || '')) query.categoryId = categoryId;
  ['minPrice', 'maxPrice'].forEach((k) => {
    const v = params.get(k);
    if (v !== null && v !== '' && Number(v) >= 0) query[k] = Number(v);
  });
  const mode = params.get('mode');
  if (MODES.includes(mode)) query.mode = mode;
  const sort = params.get('sort');
  if (SORTS.includes(sort) && sort !== 'name') query.sort = sort;
  return query;
}

function ServiceCard({ s }) {
  const t = useT();
  return (
    <article className="card service-card">
      <div className="service-card-head">
        <h2 className="service-name">{s.name}</h2>
        <ModeBadge mode={s.mode} />
      </div>
      <p className="service-provider">
        <Link to={`/providers/${s.providerId}`}>{s.providerName}</Link>
        {s.providerCity && <> <span aria-hidden="true">{'•'}</span> {s.providerCity}</>}
        {s.providerRating > 0 && (
          <> <span aria-hidden="true">{'•'}</span> <span className="rating-inline">
            <span aria-hidden="true">&#9733;</span> {Number(s.providerRating).toFixed(1)}
            <span className="sr-only"> {t('site.rating.outOf5')}</span>
          </span></>
        )}
      </p>
      {s.description && <p className="service-desc">{s.description}</p>}
      <ul className="service-facts">
        <li>{t('site.services.duration', { min: s.durationMin })}</li>
        {s.categoryName && <li>{s.categoryName}</li>}
        {s.depositPercent > 0 && s.depositPercent < 100 && <li>{t('site.services.deposit', { pct: s.depositPercent })}</li>}
      </ul>
      <div className="service-foot">
        <strong className="service-price">{formatMoney(s.price)}</strong>
        <Link className="btn btn-primary btn-sm" to={`/book/${s.providerId}/${s.id}`}
          aria-label={t('site.services.bookAria', { name: s.name, provider: s.providerName })}>
          {t('site.services.book')}
        </Link>
      </div>
    </article>
  );
}

/** FR-18: browse and search services across providers; every filter lives in the URL. */
export default function ServicesPage() {
  const t = useT();
  const [params, update] = useUrlFilters();
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);

  const [q, setQ] = useDebouncedField(params.get('q') || '', (v) => update({ q: v.trim() }, { replace: true }));
  const [city, setCity] = useDebouncedField(params.get('city') || '', (v) => update({ city: v.trim() }, { replace: true }));
  const [minPrice, setMinPrice] = useDebouncedField(params.get('minPrice') || '', (v) => update({ minPrice: v }, { replace: true }));
  const [maxPrice, setMaxPrice] = useDebouncedField(params.get('maxPrice') || '', (v) => update({ maxPrice: v }, { replace: true }));

  const query = servicesQuery(params);
  const queryKey = JSON.stringify(query);
  const page = query.page;

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    api.get('/services', { params: JSON.parse(queryKey) })
      .then((r) => { if (id === requestId.current) setData(r.data); })
      .catch((e) => { if (id === requestId.current) setError(getErrorMessage(e, t('site.services.loadFailed'))); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [queryKey, attempt, t]);

  const content = data?.content || [];
  const hasFilters = ['q', 'city', 'categoryId', 'minPrice', 'maxPrice', 'mode'].some((k) => params.get(k));
  const priceProblem = minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice);

  const clear = () => update({ q: null, city: null, categoryId: null, minPrice: null, maxPrice: null, mode: null });
  const goPage = (p) => {
    update({ page: p || null });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="container page">
      <h1 className="page-title">{t('site.services.title')}</h1>
      <p className="page-lead">{t('site.services.lead')}</p>

      <form className="card card-pad mt-3 filter-grid" role="search" aria-label={t('site.services.filters')}
        onSubmit={(e) => e.preventDefault()}>
        <div className="field filter-wide">
          <label htmlFor="sv-q">{t('site.filters.search')}</label>
          <input id="sv-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('site.services.searchPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="sv-cat">{t('site.filters.category')}</label>
          <select id="sv-cat" value={params.get('categoryId') || ''} onChange={(e) => update({ categoryId: e.target.value })}>
            <option value="">{t('site.filters.allCategories')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sv-city">{t('site.filters.city')}</label>
          <input id="sv-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2"
            placeholder={t('site.filters.cityPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="sv-mode">{t('site.filters.mode')}</label>
          <select id="sv-mode" value={query.mode || ''} onChange={(e) => update({ mode: e.target.value })}>
            <option value="">{t('site.filters.anyMode')}</option>
            {MODES.map((m) => <option key={m} value={m}>{t(`site.mode.${m}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sv-min">{t('site.filters.minPrice')}</label>
          <input id="sv-min" type="number" inputMode="numeric" min="0" step="50" value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)} aria-describedby={priceProblem ? 'sv-price-error' : undefined} />
        </div>
        <div className="field">
          <label htmlFor="sv-max">{t('site.filters.maxPrice')}</label>
          <input id="sv-max" type="number" inputMode="numeric" min="0" step="50" value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)} aria-invalid={priceProblem || undefined}
            aria-describedby={priceProblem ? 'sv-price-error' : undefined} />
        </div>
        <div className="field">
          <label htmlFor="sv-sort">{t('site.filters.sort')}</label>
          <select id="sv-sort" value={SORTS.includes(params.get('sort')) ? params.get('sort') : 'name'}
            onChange={(e) => update({ sort: e.target.value === 'name' ? null : e.target.value })}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`site.services.sort.${s}`)}</option>)}
          </select>
        </div>
        {hasFilters && (
          <div className="filter-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>{t('site.filters.clear')}</button>
          </div>
        )}
        {priceProblem && <p className="hint error-text filter-full" id="sv-price-error">{t('site.filters.priceOrder')}</p>}
      </form>

      <p className="results-status" role="status" aria-live="polite">
        {loading ? t('site.filters.searching') : data ? tp(t, 'site.services.found', { count: data.totalElements ?? content.length }) : ''}
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
          <h2 className="empty-title">{t('site.services.none')}</h2>
          <p className="mt-1">{t('site.filters.tryAdjusting')}</p>
          {hasFilters && <button type="button" className="btn btn-outline mt-2" onClick={clear}>{t('site.filters.clear')}</button>}
        </div>
      ) : (
        <>
          <ul className="grid grid-3 plain-grid card-grid" aria-busy={loading || undefined} style={{ opacity: loading ? 0.6 : 1 }}>
            {content.map((s) => <li key={s.id}><ServiceCard s={s} /></li>)}
          </ul>
          <Pager page={data.page ?? page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={goPage} />
        </>
      )}
    </div>
  );
}
