import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import ProviderDashboard from '../pages/provider/ProviderDashboard';
import ProviderAppointments from '../pages/provider/ProviderAppointments';
import ProviderServices from '../pages/provider/ProviderServices';
import ProviderStaff from '../pages/provider/ProviderStaff';
import ProviderAvailability from '../pages/provider/ProviderAvailability';
import ProviderEarnings from '../pages/provider/ProviderEarnings';
import ProviderSetting from '../pages/provider/ProviderSetting';

// Provider portal (and, later, the staff portal).
export const providerTitles = [
  [/^\/dashboard\/provider\/appointments/, 'Appointments'],
  [/^\/dashboard\/provider\/services/, 'Services'],
  [/^\/dashboard\/provider\/staff/, 'Team'],
  [/^\/dashboard\/provider\/availability/, 'Availability'],
  [/^\/dashboard\/provider\/earnings/, 'Earnings'],
  [/^\/dashboard\/provider\/settings/, 'Business settings'],
  [/^\/dashboard\/provider/, 'Provider dashboard']
];

export const providerRoutes = (
  <>
    <Route element={<ProtectedRoute roles={['PROVIDER']} />}>
      <Route path="/dashboard/provider" element={<ProviderDashboard />} />
      <Route path="/dashboard/provider/appointments" element={<ProviderAppointments />} />
      <Route path="/dashboard/provider/services" element={<ProviderServices />} />
      <Route path="/dashboard/provider/staff" element={<ProviderStaff />} />
      <Route path="/dashboard/provider/availability" element={<ProviderAvailability />} />
      <Route path="/dashboard/provider/earnings" element={<ProviderEarnings />} />
      <Route path="/dashboard/provider/settings" element={<ProviderSetting />} />
    </Route>
  </>
);
