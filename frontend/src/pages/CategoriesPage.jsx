import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { InlineLoader } from '../components/Loader';
import { useT } from '../i18n';

export default function CategoriesPage() {
  const t = useT();
  const [categories, setCategories] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    api.get('/categories')
      .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => { setCategories([]); setFailed(true); });
  }, [attempt]);

  return (
    <div className="container page">
      <h1 className="page-title">{t('site.categories.title')}</h1>
      <p className="page-lead">{t('site.categories.lead')}</p>

      {!categories ? (
        <p className="muted-line mt-3" role="status"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
      ) : failed ? (
        <div className="form-error mt-3" role="alert">
          {t('site.categories.loadFailed')}{' '}
          <button type="button" className="btn btn-outline btn-xs" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</button>
        </div>
      ) : categories.length === 0 ? (
        <div className="empty mt-3"><p>{t('site.categories.empty')}</p></div>
      ) : (
        <ul className="grid grid-3 mt-3 plain-grid card-grid">
          {categories.map((c) => (
            <li key={c.id}>
              <Link to={`/providers?categoryId=${c.id}`} className="card card-pad card-hover category-card">
                <span className="provider-logo category-ico-lg" aria-hidden="true">{c.icon || '✦'}</span>
                <h2 className="category-card-title">{c.name}</h2>
                <p className="category-card-text">{c.description || t('site.categories.fallbackText')}</p>
                <span className="link-more">{t('site.categories.explore')} <span aria-hidden="true">&rarr;</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 center">
        <Link to="/services" className="btn btn-outline">{t('site.home.servicesCta')}</Link>
      </p>
    </div>
  );
}
