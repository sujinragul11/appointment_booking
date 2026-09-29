import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader />;

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  if (roles && !roles.includes(user.role)) {
    const home = user.role === 'ADMIN' ? '/dashboard/admin' : user.role === 'PROVIDER' ? '/dashboard/provider' : '/dashboard';
    return <Navigate to={home} replace />;
  }

  return <Outlet />;
}