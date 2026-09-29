import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Sidebar for account pages. Bookings/addresses are customer-only, so other roles get a
// link back to their own dashboard instead.
export default function AccountNav() {
  const { user } = useAuth();
  const role = user?.role;

  const links = [];
  if (role === 'CUSTOMER') links.push({ to: '/dashboard', label: 'My bookings', end: true });
  if (role === 'PROVIDER') links.push({ to: '/dashboard/provider', label: 'Provider dashboard', end: true });
  if (role === 'ADMIN') links.push({ to: '/dashboard/admin', label: 'Admin dashboard', end: true });
  links.push({ to: '/profile', label: 'Profile' });
  if (role === 'CUSTOMER') links.push({ to: '/addresses', label: 'Addresses' });
  links.push({ to: '/notifications', label: 'Notifications' });
  if (role === 'CUSTOMER') links.push({ to: '/providers', label: 'Find providers' });

  return (
    <aside className="dash-side">
      <nav className="dash-nav" aria-label="Account">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={Boolean(l.end)}>{l.label}</NavLink>
        ))}
      </nav>
    </aside>
  );
}
