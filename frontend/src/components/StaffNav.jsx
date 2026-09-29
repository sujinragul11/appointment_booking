import { useT } from '../i18n';
import { PortalNav } from './ProviderNav';

/** Sidebar for the staff portal (role STAFF). */
export default function StaffNav() {
  const t = useT();
  const links = [
    { to: '/dashboard/staff', label: t('provider.staffNav.appointments'), icon: '▦', end: true },
    { to: '/dashboard/staff/availability', label: t('provider.staffNav.availability'), icon: '◷' },
    { to: '/notifications', label: t('provider.staffNav.notifications'), icon: '✉' },
    { to: '/profile', label: t('provider.staffNav.profile'), icon: '☺' }
  ];
  return <PortalNav label={t('provider.staffNav.label')} links={links} />;
}
