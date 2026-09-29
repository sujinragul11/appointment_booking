import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ProvidersPage from '../pages/ProvidersPage';
import CategoriesPage from '../pages/CategoriesPage';
import ProviderDetail from '../pages/ProviderDetail';
import BookingWizard from '../pages/BookingWizard';
import BookSuccess from '../pages/BookSuccess';
import CustomerDashboard from '../pages/dashboard/CustomerDashboard';
import AppointmentDetail from '../pages/dashboard/AppointmentDetail';
import Profile from '../pages/dashboard/Profile';
import NotificationsPage from '../pages/dashboard/NotificationsPage';
import AddressBook from '../pages/dashboard/AddressBook';

// Public site, authentication and customer area.
// Page titles (WCAG 2.4.2): first matching pattern wins; more specific patterns first.
export const siteTitles = [
  [/^\/login/, 'Sign in'],
  [/^\/register/, 'Create account'],
  [/^\/providers\/[^/]+/, 'Provider'],
  [/^\/providers/, 'Browse providers'],
  [/^\/categories/, 'Categories'],
  [/^\/book\/success/, 'Booking confirmed'],
  [/^\/book\//, 'Book an appointment'],
  [/^\/appointments\//, 'Appointment'],
  [/^\/addresses/, 'Addresses'],
  [/^\/profile/, 'Profile'],
  [/^\/notifications/, 'Notifications'],
  [/^\/dashboard$/, 'My bookings']
];

export const siteRoutes = (
  <>
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
      <Route path="/addresses" element={<AddressBook />} />
    </Route>

    {/* Appointment detail is shared: customers, providers, staff and admins see role-specific actions */}
    <Route element={<ProtectedRoute roles={['CUSTOMER', 'PROVIDER', 'STAFF', 'ADMIN']} />}>
      <Route path="/appointments/:id" element={<AppointmentDetail />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/notifications" element={<NotificationsPage />} />
    </Route>
  </>
);
