import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import VerifyEmail from '../pages/VerifyEmail';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import ProvidersPage from '../pages/ProvidersPage';
import ServicesPage from '../pages/ServicesPage';
import CategoriesPage from '../pages/CategoriesPage';
import ProviderDetail from '../pages/ProviderDetail';
import BookingWizard from '../pages/BookingWizard';
import BookSuccess from '../pages/BookSuccess';
import CustomerDashboard from '../pages/dashboard/CustomerDashboard';
import AppointmentDetail from '../pages/dashboard/AppointmentDetail';
import Profile from '../pages/dashboard/Profile';
import NotificationsPage from '../pages/dashboard/NotificationsPage';
import AddressBook from '../pages/dashboard/AddressBook';
import PaymentsPage from '../pages/dashboard/PaymentsPage';

// Public site, authentication and customer area.
// Page titles (WCAG 2.4.2): first matching pattern wins; more specific patterns first.
export const siteTitles = [
  [/^\/login/, 'Sign in'],
  [/^\/register/, 'Create account'],
  [/^\/verify/, 'Verify e-mail'],
  [/^\/forgot-password/, 'Forgot password'],
  [/^\/reset-password/, 'Reset password'],
  [/^\/providers\/[^/]+/, 'Provider'],
  [/^\/providers/, 'Browse providers'],
  [/^\/services/, 'Services'],
  [/^\/categories/, 'Categories'],
  [/^\/book\/success/, 'Booking confirmed'],
  [/^\/book\//, 'Book an appointment'],
  [/^\/appointments\//, 'Appointment'],
  [/^\/addresses/, 'Addresses'],
  [/^\/payments/, 'Payments'],
  [/^\/profile/, 'Profile'],
  [/^\/notifications/, 'Notifications'],
  [/^\/dashboard$/, 'My bookings']
];

export const siteRoutes = (
  <>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/verify" element={<VerifyEmail />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/providers" element={<ProvidersPage />} />
    <Route path="/services" element={<ServicesPage />} />
    <Route path="/categories" element={<CategoriesPage />} />
    <Route path="/providers/:id" element={<ProviderDetail />} />
    <Route path="/book/:providerId/:serviceId" element={<BookingWizard />} />
    <Route path="/book/success/:id" element={<BookSuccess />} />

    <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
      <Route path="/dashboard" element={<CustomerDashboard />} />
      <Route path="/addresses" element={<AddressBook />} />
      <Route path="/payments" element={<PaymentsPage />} />
    </Route>

    {/* Appointment detail is shared: customers, providers, staff and admins see role-specific actions */}
    <Route element={<ProtectedRoute roles={['CUSTOMER', 'PROVIDER', 'STAFF', 'ADMIN']} />}>
      <Route path="/appointments/:id" element={<AppointmentDetail />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/notifications" element={<NotificationsPage />} />
    </Route>
  </>
);
