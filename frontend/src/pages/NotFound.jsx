import { Link } from 'react-router-dom';
import { useT } from '../i18n';

export default function NotFound() {
  const t = useT();
  return (
    <div className="container page" style={{ textAlign: 'center' }}>
      <div className="grad-text" style={{ fontSize: '6rem', fontWeight: 800 }} aria-hidden="true">404</div>
      <h1 className="mt-2" style={{ fontSize: '1.6rem' }}>{t('error.notFoundTitle')}</h1>
      <p style={{ color: 'var(--muted)', margin: '10px 0 24px' }}>{t('error.notFoundText')}</p>
      <Link className="btn btn-primary" to="/">{t('common.backHome')}</Link>
    </div>
  );
}
