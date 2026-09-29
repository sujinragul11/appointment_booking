import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import useUnreadCount from '../hooks/useUnreadCount';
import { initials } from '../utils/format';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t, lang, setLang, languages } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const unread = useUnreadCount(user);
  const [open, setOpen] = useState(false);

  // Collapse the mobile menu on navigation and with Escape.
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);

  const doLogout = async () => {
    close();
    await logout();
    navigate('/');
  };

  const links = [
    { to: '/providers', label: t('nav.browse') },
    { to: '/categories', label: t('nav.categories') }
  ];
  if (user?.role === 'PROVIDER') links.push({ to: '/dashboard/provider', label: t('nav.dashboard') });
  if (user?.role === 'STAFF') links.push({ to: '/dashboard/staff', label: t('nav.dashboard') });
  if (user?.role === 'ADMIN') links.push({ to: '/dashboard/admin', label: t('nav.admin') });
  if (user?.role === 'CUSTOMER') links.push({ to: '/dashboard', label: t('nav.myBookings'), end: true });

  const languageSelect = (
    <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('common.language')}>
      {languages.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
    </select>
  );

  return (
    <header className="navbar">
      <nav className="container navbar-inner" aria-label={t('nav.main')}>
        <Link to="/" className="logo" onClick={close} aria-label={t('nav.home')}>
          <span className="logo-mark" aria-hidden="true">S</span> <span aria-hidden="true">Sloto</span>
        </Link>

        <button type="button" className="nav-toggle" onClick={() => setOpen(!open)}
          aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')} aria-expanded={open} aria-controls="primary-nav">
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
          {!open && unread > 0 && <span className="nav-toggle-dot" aria-hidden="true" />}
        </button>

        <ul id="primary-nav" className={`nav-links ${open ? 'open' : ''}`}>
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={Boolean(l.end)} className={({ isActive }) => (isActive ? 'active' : '')} onClick={close}>
                {l.label}
              </NavLink>
            </li>
          ))}
          <li className="nav-actions">
            {languageSelect}
            {user ? (
              <div className="nav-user">
                <Link to="/notifications" className="bell-wrap" onClick={close}
                  aria-label={unread > 0 ? t('nav.notificationsUnread', { count: unread }) : t('nav.notifications')}>
                  <span aria-hidden="true">&#128276;</span>
                  {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
                </Link>
                <Link to="/profile" className="avatar" onClick={close} aria-label={t('nav.profile')}>
                  {user.photoUrl ? <img src={user.photoUrl} alt="" /> : <span aria-hidden="true">{initials(user.name)}</span>}
                </Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={doLogout}>{t('nav.logout')}</button>
              </div>
            ) : (
              <div className="nav-user">
                <Link to="/login" onClick={close}>{t('nav.signIn')}</Link>
                <Link to="/register" className="btn btn-primary btn-sm" onClick={close}>{t('nav.getStarted')}</Link>
              </div>
            )}
          </li>
        </ul>
      </nav>
    </header>
  );
}
