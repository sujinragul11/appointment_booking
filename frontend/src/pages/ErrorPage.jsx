import { useEffect, useRef } from 'react';
import { useT } from '../i18n';

// Rendered by ErrorBoundary, possibly outside the router, so it uses plain links.
export default function ErrorPage({ error, onRetry }) {
  const t = useT();
  const headingRef = useRef(null);

  useEffect(() => { headingRef.current?.focus(); }, []);

  return (
    <div className="container page error-page">
      <div className="error-ico" aria-hidden="true">!</div>
      <h1 ref={headingRef} tabIndex={-1} className="mt-2">{t('error.title')}</h1>
      <p className="error-lead">{t('error.text')}</p>
      <div className="error-actions">
        {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}>{t('error.retry')}</button>}
        <a className="btn btn-outline" href="/">{t('error.home')}</a>
      </div>
      {import.meta.env.DEV && error && (
        <details className="error-details">
          <summary>{t('error.details')}</summary>
          <pre>{String(error.stack || error.message || error)}</pre>
        </details>
      )}
    </div>
  );
}
