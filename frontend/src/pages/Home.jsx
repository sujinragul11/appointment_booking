import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import ProviderCard, { priceRange } from '../components/ProviderCard';
import { InlineLoader } from '../components/Loader';
import { useT } from '../i18n';

// Renders "line one\nline two with {brand}" with a line break and the gradient brand name.
function HeroTitle({ text }) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split('{brand}').map((part, j) => (
        <Fragment key={j}>
          {j > 0 && <span className="grad-text">Sloto</span>}
          {part}
        </Fragment>
      ))}
    </Fragment>
  ));
}

export default function Home() {
  const t = useT();
  const navigate = useNavigate();
  const [categories, setCategories] = useState(null);
  const [top, setTop] = useState(null);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(Array.isArray(r.data) ? r.data : [])).catch(() => setCategories([]));
    api.get('/providers', { params: { sort: 'rating', page: 0, size: 6 } })
      .then((r) => setTop(r.data?.content || []))
      .catch(() => setTop([]));
  }, []);

  const search = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (city.trim()) params.set('city', city.trim());
    const query = params.toString();
    navigate(`/providers${query ? `?${query}` : ''}`);
  };

  const featured = top?.[0];
  const featuredWhere = featured ? [featured.city, featured.country].filter(Boolean).join(', ') : '';
  const featuredPrices = featured ? priceRange(featured.minPrice, featured.maxPrice) : '';

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span className="hero-eyebrow-mark" aria-hidden="true">✦</span>
              {t('home.heroEyebrow')}
            </p>
            <h1><HeroTitle text={t('home.heroTitle')} /></h1>
            <p>{t('home.heroText')}</p>

            <form className="search-panel" onSubmit={search} role="search" aria-label={t('site.home.searchLabel')}>
              <label htmlFor="home-q" className="sr-only">{t('site.home.whatLabel')}</label>
              <input id="home-q" placeholder={t('site.home.whatPlaceholder')} value={q}
                onChange={(e) => setQ(e.target.value)} />
              <div className="divider" aria-hidden="true" />
              <label htmlFor="home-city" className="sr-only">{t('site.home.whereLabel')}</label>
              <input id="home-city" placeholder={t('site.home.wherePlaceholder')} value={city} onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2" />
              <button className="btn btn-primary" type="submit">{t('home.searchButton')}</button>
            </form>

            <ul className="hero-trust plain-list">
              {[t('home.trustVerified'), t('home.trustInstant'), t('home.trustFlexible')].map((item) => (
                <li key={item}>
                  <span className="hero-trust-mark" aria-hidden="true">✓</span>
                  {item}
                </li>
              ))}
            </ul>

            {categories?.length > 0 && (
              <div className="hero-popular">
                <span className="hero-popular-label">{t('home.popular')}</span>
                {categories.slice(0, 6).map((c) => (
                  <Link key={c.id} to={`/providers?categoryId=${c.id}`} className="chip">
                    <span aria-hidden="true">{c.icon || '✦'}</span> {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <aside className="hero-aside" aria-label={t('home.featured')}>
            <div className="hero-aside-glow" aria-hidden="true" />
            {featured ? (
              <article className="hero-feature">
                <div className="hero-feature-media">
                  {featured.coverUrl
                    ? <img src={featured.coverUrl} alt="" loading="lazy" />
                    : <span className="hero-feature-monogram" aria-hidden="true">{featured.category?.icon || '✦'}</span>}
                  <span className="hero-feature-badge">{t('home.featured')}</span>
                </div>
                <div className="hero-feature-body">
                  <div className="hero-feature-head">
                    <div className="hero-feature-logo" aria-hidden="true">
                      {featured.logoUrl ? <img src={featured.logoUrl} alt="" loading="lazy" /> : <span>{featured.category?.icon || '✦'}</span>}
                    </div>
                    <div className="hero-feature-id">
                      <h2 className="hero-feature-name">{featured.businessName}</h2>
                      <p className="hero-feature-meta">
                        {[featured.specialty || featured.category?.name, featuredWhere].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {featured.reviewCount > 0 && (
                      <span className="hero-feature-rating">
                        <span aria-hidden="true">★</span> {Number(featured.rating || 0).toFixed(1)}
                        <span className="sr-only"> {t('site.rating.outOf5')}</span>
                      </span>
                    )}
                  </div>
                  {featured.description && (
                    <p className="hero-feature-desc">
                      {featured.description.length > 128 ? `${featured.description.slice(0, 128)}…` : featured.description}
                    </p>
                  )}
                  <div className="hero-feature-foot">
                    <span className="hero-feature-price">{featuredPrices || t('site.providers.noPrices')}</span>
                    <Link to={`/providers/${featured.id}`} className="btn btn-primary btn-sm">
                      {t('common.bookNow')} <span aria-hidden="true">&rarr;</span>
                    </Link>
                  </div>
                </div>
                <p className="hero-float">
                  <span className="hero-float-mark" aria-hidden="true">✦</span>
                  {t('home.heroFloat')}
                </p>
              </article>
            ) : (
              <div className="hero-feature hero-feature-skeleton" aria-hidden="true">
                <div className="hero-skeleton-media" />
                <div className="hero-skeleton-lines">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="container page home-sections" aria-labelledby="home-categories">
        <div className="section-title">
          <div>
            <h2 id="home-categories">{t('home.categoriesTitle')}</h2>
            <p>{t('home.categoriesText')}</p>
          </div>
          <Link to="/categories" className="link-more">{t('common.viewAll')} <span aria-hidden="true">&rarr;</span></Link>
        </div>
        {categories === null ? (
          <p className="muted-line" role="status"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
        ) : categories.length === 0 ? (
          <p className="muted-line">{t('site.categories.empty')}</p>
        ) : (
          <ul className="grid grid-4 plain-grid card-grid">
            {categories.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link to={`/providers?categoryId=${c.id}`} className="card card-pad card-hover category-tile">
                  <span className="provider-logo category-ico" aria-hidden="true">{c.icon || '✦'}</span>
                  <span>
                    <span className="category-name">{c.name}</span>
                    <span className="category-sub">{t('home.bookInstantly')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="services-band mt-4">
          <div>
            <h2>{t('site.home.servicesTitle')}</h2>
            <p>{t('site.home.servicesText')}</p>
          </div>
          <Link to="/services" className="btn btn-outline">{t('site.home.servicesCta')} <span aria-hidden="true">&rarr;</span></Link>
        </div>

        <div className="section-title home-top">
          <div>
            <h2>{t('home.topTitle')}</h2>
            <p>{t('home.topText')}</p>
          </div>
          <Link to="/providers?sort=rating" className="link-more">{t('common.seeAll')} <span aria-hidden="true">&rarr;</span></Link>
        </div>
        {top === null ? (
          <p className="muted-line" role="status"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
        ) : top.length > 0 ? (
          <ul className="grid grid-3 plain-grid card-grid">
            {top.map((p) => <li key={p.id}><ProviderCard p={p} /></li>)}
          </ul>
        ) : (
          <p className="empty">
            <span className="empty-ico" aria-hidden="true">{'\u{1F50D}'}</span><br />{t('home.noProviders')}
          </p>
        )}
      </section>

      <section className="cta-band">
        <div className="container">
          <h2>{t('home.ctaTitle')}</h2>
          <p>{t('home.ctaText')}</p>
          <Link to="/register?role=PROVIDER" className="btn btn-light">{t('home.ctaButton')}</Link>
        </div>
      </section>
    </>
  );
}
