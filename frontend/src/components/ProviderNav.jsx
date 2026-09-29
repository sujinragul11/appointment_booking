import { useEffect, useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useT } from '../i18n';

function isCurrent(link, pathname) {
  if (link.end) return pathname === link.to || pathname === `${link.to}/`;
  return pathname === link.to || pathname.startsWith(`${link.to}/`);
}

/**
 * Sidebar for a portal (provider / staff). On wide screens the links are always shown; below
 * 900px the list collapses behind a toggle that names the current page (aria-expanded).
 */
export function PortalNav({ label, links }) {
  const t = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const listId = useId();

  // Collapse again after navigating, and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current = links.find((l) => isCurrent(l, pathname));

  return (
    <aside className="dash-side pnav-side">
      <nav className="pnav" aria-label={label}>
        <button type="button" className="pnav-toggle" aria-expanded={open} aria-controls={listId}
          onClick={() => setOpen((o) => !o)}>
          <span className="pnav-toggle-text">
            <span className="pnav-toggle-kicker">{label}</span>{' '}
            <span className="pnav-toggle-current">{current ? current.label : t('provider.nav.menu')}</span>
          </span>
          <span className="pnav-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        <ul id={listId} className={`pnav-list ${open ? 'open' : ''}`}>
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={Boolean(l.end)} className={({ isActive }) => `pnav-link${isActive ? ' active' : ''}`}>
                <span className="pnav-ico" aria-hidden="true">{l.icon}</span>
                <span>{l.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/** Sidebar used by every provider-portal page. */
export default function ProviderNav() {
  const t = useT();
  const links = [
    { to: '/dashboard/provider', label: t('provider.nav.overview'), icon: '⌂', end: true },
    { to: '/dashboard/provider/appointments', label: t('provider.nav.schedule'), icon: '▦' },
    { to: '/dashboard/provider/services', label: t('provider.nav.services'), icon: '☰' },
    { to: '/dashboard/provider/staff', label: t('provider.nav.team'), icon: '☺' },
    { to: '/dashboard/provider/availability', label: t('provider.nav.availability'), icon: '◷' },
    { to: '/dashboard/provider/reviews', label: t('provider.nav.reviews'), icon: '★' },
    { to: '/dashboard/provider/earnings', label: t('provider.nav.earnings'), icon: '₹' },
    { to: '/dashboard/provider/settings', label: t('provider.nav.settings'), icon: '⚙' }
  ];
  return <PortalNav label={t('provider.nav.label')} links={links} />;
}
