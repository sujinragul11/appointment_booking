import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { useT } from './i18n';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ProvidersPage from './pages/ProvidersPage';
import CategoriesPage from './pages/CategoriesPage';
import ProviderDetail from './pages/ProviderDetail';
import BookingWizard from './pages/BookingWizard';
import BookSuccess from './pages/BookSuccess';
import NotFound from './pages/NotFound';

import CustomerDashboard from './pages/dashboard/CustomerDashboard';
import AppointmentDetail from './pages/dashboard/AppointmentDetail';
import Profile from './pages/dashboard/Profile';
import NotificationsPage from './pages/dashboard/NotificationsPage';
import AddressBook from './pages/dashboard/AddressBook';

import ProviderDashboard from './pages/provider/ProviderDashboard';
import ProviderAppointments from './pages/provider/ProviderAppointments';
import ProviderServices from './pages/provider/ProviderServices';
import ProviderStaff from './pages/provider/ProviderStaff';
import ProviderAvailability from './pages/provider/ProviderAvailability';
import ProviderEarnings from './pages/provider/ProviderEarnings';
import ProviderSetting from './pages/provider/ProviderSetting';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProviders from './pages/admin/AdminProviders';
import AdminUsers from './pages/admin/AdminUsers';
import AdminCoupons from './pages/admin/AdminCoupons';

const BASE_TITLE = 'Sloto — Find & book appointments anywhere';

// WCAG 2.4.2: every page gets its own document title. First match wins.
const PAGE_TITLES = [
  [/^\/login/, 'Sign in'],
  [/^\/register/, 'Create account'],
  [/^\/providers\/[^/]+/, 'Provider'],
  [/^\/providers/, 'Browse providers'],
  [/^\/categories/, 'Categories'],
  [/^\/book\/success/, 'Booking confirmed'],
  [/^\/book\//, 'Book an appointment'],
  [/^\/dashboard\/provider\/appointments/, 'Appointments'],
  [/^\/dashboard\/provider\/services/, 'Services'],
  [/^\/dashboard\/provider\/staff/, 'Team'],
  [/^\/dashboard\/provider\/availability/, 'Availability'],
  [/^\/dashboard\/provider\/earnings/, 'Earnings'],
  [/^\/dashboard\/provider\/settings/, 'Business settings'],
  [/^\/dashboard\/provider/, 'Provider dashboard'],
  [/^\/dashboard\/admin\/providers/, 'Providers (admin)'],
  [/^\/dashboard\/admin\/users/, 'Users (admin)'],
  [/^\/dashboard\/admin\/coupons/, 'Coupons (admin)'],
  [/^\/dashboard\/admin/, 'Admin dashboard'],
  [/^\/dashboard/, 'My bookings'],
  [/^\/appointments\//, 'Appointment'],
  [/^\/addresses/, 'Addresses'],
  [/^\/profile/, 'Profile'],
  [/^\/notifications/, 'Notifications'],
  [/^\/404/, 'Page not found']
];

function usePageTitle(pathname) {
  useEffect(() => {
    const match = PAGE_TITLES.find(([pattern]) => pattern.test(pathname));
    document.title = match ? `${match[1]} · Sloto` : BASE_TITLE;
  }, [pathname]);
}

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
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/providers/:id" element={<ProviderDetail />} />
            <Route path="/book/:providerId/:serviceId" element={<BookingWizard />} />
            <Route path="/book/success/:id" element={<BookSuccess />} />

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
              <Route path="/dashboard/admin/users" element={<AdminUsers />} />
              <Route path="/dashboard/admin/coupons" element={<AdminCoupons />} />
            </Route>

            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </ToastProvider>
  );
}
