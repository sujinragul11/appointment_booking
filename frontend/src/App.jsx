import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/Toast';
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

export default function App() {
  return (
    <ToastProvider>
      <Navbar />
      <main>
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
      </main>
      <Footer />
    </ToastProvider>
  );
}