import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useT } from '../i18n';

// Admin panel sections, in sidebar order. `end` = only active on the exact path.
export const ADMIN_LINKS = [
  { to: '/dashboard/admin', key: 'overview', end: true },
  { to: '/dashboard/admin/users', key: 'users' },
  { to: '/dashboard/admin/providers', key: 'providers' },
  { to: '/dashboard/admin/services', key: 'services' },
  { to: '/dashboard/admin/categories', key: 'categories' },
  { to: '/dashboard/admin/appointments', key: 'appointments' },
  { to: '/dashboard/admin/reports', key: 'reports' },
  { to: '/dashboard/admin/reviews', key: 'reviews' },
  { to: '/dashboard/admin/coupons', key: 'coupons' },
  { to: '/dashboard/admin/audit', key: 'audit' }
];

export function currentAdminLink(pathname) {
  return ADMIN_LINKS.find((l) => (l.end ? pathname === l.to : pathname === l.to || pathname.startsWith(`${l.to}/`)))
    || ADMIN_LINKS.find((l) => pathname.startsWith(l.to)) || ADMIN_LINKS[0];
}

/**
 * Sidebar for every admin page. NavLink marks the current section (class "active" +
 * aria-current="page"). Below 900px it collapses behind a disclosure button that names the
 * current section; it closes again on navigation and with Escape.
 */
export default function AdminNav() {
  const t = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const toggleRef = useRef(null);
  const current = currentAdminLink(pathname);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <aside className="dash-side admin-side">
      <nav className="admin-nav" aria-label={t('admin.nav.label')}>
        <button ref={toggleRef} type="button" className="admin-nav-toggle" aria-expanded={open} aria-controls={listId}
          onClick={() => setOpen((o) => !o)}>
          <span className="admin-nav-toggle-text">
            <span className="admin-nav-toggle-label">{t('admin.nav.menu')}</span>
            <span className="admin-nav-toggle-current">{t(`admin.nav.${current.key}`)}</span>
          </span>
          <span className={`admin-nav-caret ${open ? 'is-open' : ''}`} aria-hidden="true">&#9662;</span>
        </button>
        <ul id={listId} className={`admin-nav-list ${open ? 'is-open' : ''}`}>
          {ADMIN_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} end={Boolean(link.end)}>{t(`admin.nav.${link.key}`)}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
