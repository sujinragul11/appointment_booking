import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminUsers from '../pages/admin/AdminUsers';
import AdminProviders from '../pages/admin/AdminProviders';
import AdminServices from '../pages/admin/AdminServices';
import AdminCategories from '../pages/admin/AdminCategories';
import AdminAppointments from '../pages/admin/AdminAppointments';
import AdminReports from '../pages/admin/AdminReports';
import AdminReviews from '../pages/admin/AdminReviews';
import AdminCoupons from '../pages/admin/AdminCoupons';
import AdminAudit from '../pages/admin/AdminAudit';

// Admin panel. Page titles (WCAG 2.4.2): first matching pattern wins, so the overview comes last.
export const adminTitles = [
  [/^\/dashboard\/admin\/users/, 'Users (admin)'],
  [/^\/dashboard\/admin\/providers/, 'Providers (admin)'],
  [/^\/dashboard\/admin\/services/, 'Services (admin)'],
  [/^\/dashboard\/admin\/categories/, 'Categories (admin)'],
  [/^\/dashboard\/admin\/appointments/, 'Appointments (admin)'],
  [/^\/dashboard\/admin\/reports/, 'Reports (admin)'],
  [/^\/dashboard\/admin\/reviews/, 'Reviews (admin)'],
  [/^\/dashboard\/admin\/coupons/, 'Coupons (admin)'],
  [/^\/dashboard\/admin\/audit/, 'Audit log (admin)'],
  [/^\/dashboard\/admin/, 'Admin dashboard']
];

export const adminRoutes = (
  <>
    <Route element={<ProtectedRoute roles={['ADMIN']} />}>
      <Route path="/dashboard/admin" element={<AdminDashboard />} />
      <Route path="/dashboard/admin/users" element={<AdminUsers />} />
      <Route path="/dashboard/admin/providers" element={<AdminProviders />} />
      <Route path="/dashboard/admin/services" element={<AdminServices />} />
      <Route path="/dashboard/admin/categories" element={<AdminCategories />} />
      <Route path="/dashboard/admin/appointments" element={<AdminAppointments />} />
      <Route path="/dashboard/admin/reports" element={<AdminReports />} />
      <Route path="/dashboard/admin/reviews" element={<AdminReviews />} />
      <Route path="/dashboard/admin/coupons" element={<AdminCoupons />} />
      <Route path="/dashboard/admin/audit" element={<AdminAudit />} />
    </Route>
  </>
);
