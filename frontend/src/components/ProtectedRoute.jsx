import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';
import { homePathFor, loginPath } from '../utils/routes';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader />;

  if (!user) {
    const here = location.pathname + location.search;
    return <Navigate to={loginPath(here)} state={{ from: here }} replace />;
  }

  // Signed in but not allowed here: go to the role's own home ("/" for unknown roles).
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;

  return <Outlet />;
}
