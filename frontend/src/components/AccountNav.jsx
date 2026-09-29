import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

// Sidebar for account pages. Bookings, payments and addresses are customer-only, so other
// roles get a link back to their own dashboard instead.
export default function AccountNav() {
  const { user } = useAuth();
  const t = useT();
  const role = user?.role;

  const links = [];
  if (role === 'CUSTOMER') links.push({ to: '/dashboard', label: t('site.account.bookings'), end: true });
  if (role === 'PROVIDER') links.push({ to: '/dashboard/provider', label: t('site.account.providerDashboard'), end: true });
  if (role === 'STAFF') links.push({ to: '/dashboard/staff', label: t('site.account.staffDashboard'), end: true });
  if (role === 'ADMIN') links.push({ to: '/dashboard/admin', label: t('site.account.adminDashboard'), end: true });
  if (role === 'CUSTOMER') links.push({ to: '/payments', label: t('site.account.payments') });
  links.push({ to: '/notifications', label: t('site.account.notifications') });
  links.push({ to: '/profile', label: t('site.account.profile') });
  if (role === 'CUSTOMER') links.push({ to: '/addresses', label: t('site.account.addresses') });
  if (role === 'CUSTOMER') links.push({ to: '/services', label: t('site.account.findServices') });

  return (
    <aside className="dash-side">
      <nav className="dash-nav" aria-label={t('site.account.nav')}>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={Boolean(l.end)}>{l.label}</NavLink>
        ))}
      </nav>
    </aside>
  );
}
