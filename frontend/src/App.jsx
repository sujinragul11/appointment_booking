import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { useT } from './i18n';
import NotFound from './pages/NotFound';
// Each area owns its route module (routes + page titles).
import { siteRoutes, siteTitles } from './routes/site';
import { providerRoutes, providerTitles } from './routes/provider';
import { adminRoutes, adminTitles } from './routes/admin';

const BASE_TITLE = 'Sloto — Find & book appointments anywhere';

// WCAG 2.4.2: every page gets its own document title. First match wins.
const PAGE_TITLES = [
  ...adminTitles,
  ...providerTitles,
  ...siteTitles,
  [/^\/404/, 'Page not found']
];

<<<<<<< HEAD
function usePageTitle(pathname) {
  useEffect(() => {
    const match = PAGE_TITLES.find(([pattern]) => pattern.test(pathname));
    document.title = match ? `${match[1]} · Sloto` : BASE_TITLE;
  }, [pathname]);
}
=======
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProviders from './pages/admin/AdminProviders';
import AdminCategories from './pages/admin/AdminCategories';
import AdminUsers from './pages/admin/AdminUsers';
import AdminCoupons from './pages/admin/AdminCoupons';
>>>>>>> a52368e (backendcommit)

export default function App() {
  const t = useT();
  const { pathname } = useLocation();
  usePageTitle(pathname);

  const skipToMain = (e) => {
    e.preventDefault();
    document.getElementById('main')?.focus();
  };

  return (
    <ToastProvider>
      <a href="#main" className="skip-link" onClick={skipToMain}>{t('common.skipToContent')}</a>
      <Navbar />
      <main id="main" tabIndex={-1}>
        {/* A crash in one page shows a friendly error; navigating elsewhere clears it. */}
        <ErrorBoundary resetKey={pathname}>
          <Routes>
            {siteRoutes}
            {providerRoutes}
            {adminRoutes}

<<<<<<< HEAD
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </ErrorBoundary>
=======
          <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
            <Route path="/dashboard" element={<CustomerDashboard />} />
            <Route path="/appointments/:id" element={<AppointmentDetail />} />
            <Route path="/addresses" element={<AddressBook />} />
          </Route>

          <Route element={<ProtectedRoute roles={['CUSTOMER', 'PROVIDER', 'ADMIN']} />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['PROVIDER']} />}>
            <Route path="/dashboard/provider" element={<ProviderDashboard />} />
            <Route path="/dashboard/provider/appointments" element={<ProviderAppointments />} />
            <Route path="/dashboard/provider/services" element={<ProviderServices />} />
            <Route path="/dashboard/provider/staff" element={<ProviderStaff />} />
            <Route path="/dashboard/provider/availability" element={<ProviderAvailability />} />
            <Route path="/dashboard/provider/earnings" element={<ProviderEarnings />} />
            <Route path="/dashboard/provider/settings" element={<ProviderSetting />} />
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/dashboard/admin" element={<AdminDashboard />} />
            <Route path="/dashboard/admin/providers" element={<AdminProviders />} />
            <Route path="/dashboard/admin/categories" element={<AdminCategories />} />
            <Route path="/dashboard/admin/users" element={<AdminUsers />} />
            <Route path="/dashboard/admin/coupons" element={<AdminCoupons />} />
          </Route>

          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
>>>>>>> a52368e (backendcommit)
      </main>
      <Footer />
    </ToastProvider>
  );
}
