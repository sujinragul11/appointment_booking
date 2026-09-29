import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import ProviderCard from '../components/ProviderCard';
import { useT } from '../i18n';

// `name` must match the category name in the backend; it is resolved to an id on /providers.
const QUICK = [
  { icon: '⚕', key: 'doctor', name: 'Doctor' },
  { icon: '☷', key: 'dentist', name: 'Dentist' },
  { icon: '✦', key: 'salon', name: 'Salon & Spa' },
  { icon: '⚚', key: 'fitness', name: 'Fitness' },
  { icon: '✎', key: 'tutor', name: 'Tutor' },
  { icon: '♦', key: 'consultant', name: 'Consultant' }
];

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
  const [categories, setCategories] = useState([]);
  const [top, setTop] = useState([]);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data || [])).catch(() => {});
    api.get('/providers?page=0&size=6').then((r) => setTop(r.data?.content || [])).catch(() => {});
  }, []);

  const search = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (city.trim()) params.set('city', city.trim());
    navigate(`/providers?${params.toString()}`);
  };

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1><HeroTitle text={t('home.heroTitle')} /></h1>
          <p>{t('home.heroText')}</p>

          <form className="search-panel" onSubmit={search} role="search">
            <label htmlFor="home-q" className="sr-only">{t('home.searchLabel')}</label>
            <input id="home-q" placeholder={t('home.searchPlaceholder')} value={q}
              onChange={(e) => setQ(e.target.value)} />
            <div className="divider" aria-hidden="true" />
            <label htmlFor="home-city" className="sr-only">{t('home.cityLabel')}</label>
            <input id="home-city" placeholder={t('home.cityPlaceholder')} value={city} onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2" />
            <button className="btn btn-primary" type="submit">{t('home.searchButton')}</button>
          </form>

          <div className="mt-4 quick-chips">
            <span className="quick-label">{t('home.popular')}</span>
            {QUICK.map((c) => (
              <Link key={c.key} to={`/providers?category=${encodeURIComponent(c.name)}`} className="chip">
                <span aria-hidden="true">{c.icon}</span> {t(`home.quick.${c.key}`)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container page" style={{ paddingTop: 44 }}>
        <div className="section-title">
          <div>
            <h2>{t('home.categoriesTitle')}</h2>
            <p>{t('home.categoriesText')}</p>
          </div>
          <Link to="/categories" className="link-more">{t('common.viewAll')} <span aria-hidden="true">&rarr;</span></Link>
        </div>
        <div className="grid grid-4">
          {categories.slice(0, 8).map((c) => (
            <Link key={c.id} to={`/providers?categoryId=${c.id}`} className="card card-pad card-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="provider-logo" style={{ marginTop: 0, fontSize: 0 }} aria-hidden="true">
                <span style={{ fontSize: '1.4rem' }}>{c.icon || '✦'}</span>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{t('home.bookInstantly')}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="section-title mt-4" style={{ marginTop: 56 }}>
          <div>
            <h2>{t('home.topTitle')}</h2>
            <p>{t('home.topText')}</p>
          </div>
          <Link to="/providers" className="link-more">{t('common.seeAll')} <span aria-hidden="true">&rarr;</span></Link>
        </div>
        {top.length > 0 ? (
          <div className="grid grid-3">
            {top.map((p) => <ProviderCard key={p.id} p={p} />)}
          </div>
        ) : (
          <p className="empty" style={{ padding: '30px 0' }}>
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
