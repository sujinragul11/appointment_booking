import { Link } from 'react-router-dom';
import { useT } from '../i18n';

export default function Footer() {
  const t = useT();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="logo"><span className="logo-mark" aria-hidden="true">S</span> Sloto</div>
            <p style={{ fontSize: '0.92rem', maxWidth: 300 }}>{t('footer.tagline')}</p>
          </div>
          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore">{t('footer.explore')}</h2>
            <Link to="/providers">{t('footer.browseProviders')}</Link>
            <Link to="/categories">{t('footer.categories')}</Link>
            <Link to="/register?role=PROVIDER">{t('footer.joinProvider')}</Link>
          </nav>
          <nav aria-labelledby="footer-account">
            <h2 id="footer-account">{t('footer.account')}</h2>
            <Link to="/login">{t('footer.signIn')}</Link>
            <Link to="/dashboard">{t('footer.myBookings')}</Link>
            <Link to="/profile">{t('footer.profile')}</Link>
          </nav>
          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal">{t('footer.legal')}</h2>
            <a href="#">{t('footer.terms')}</a>
            <a href="#">{t('footer.privacy')}</a>
            <a href="#">{t('footer.support')}</a>
          </nav>
        </div>
        <div className="footer-bottom">{t('footer.rights', { year: new Date().getFullYear() })}</div>
      </div>
    </footer>
  );
}
