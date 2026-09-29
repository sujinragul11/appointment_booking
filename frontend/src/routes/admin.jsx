import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminProviders from '../pages/admin/AdminProviders';
import AdminUsers from '../pages/admin/AdminUsers';
import AdminCoupons from '../pages/admin/AdminCoupons';

// Admin panel.
export const adminTitles = [
  [/^\/dashboard\/admin\/providers/, 'Providers (admin)'],
  [/^\/dashboard\/admin\/users/, 'Users (admin)'],
  [/^\/dashboard\/admin\/coupons/, 'Coupons (admin)'],
  [/^\/dashboard\/admin/, 'Admin dashboard']
];

export const adminRoutes = (
  <>
    <Route element={<ProtectedRoute roles={['ADMIN']} />}>
      <Route path="/dashboard/admin" element={<AdminDashboard />} />
      <Route path="/dashboard/admin/providers" element={<AdminProviders />} />
      <Route path="/dashboard/admin/users" element={<AdminUsers />} />
      <Route path="/dashboard/admin/coupons" element={<AdminCoupons />} />
    </Route>
  </>
);
