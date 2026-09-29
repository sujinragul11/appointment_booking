import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

const auth = vi.hoisted(() => ({ user: null, loading: false }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

// Mirrors App.jsx: one guarded group per role.
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
          <Route path="/dashboard" element={<div>customer area</div>} />
        </Route>
        <Route element={<ProtectedRoute roles={['PROVIDER']} />}>
          <Route path="/dashboard/provider" element={<div>provider area</div>} />
        </Route>
        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route path="/dashboard/admin" element={<div>admin area</div>} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/any-signed-in" element={<div>any role</div>} />
        </Route>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

const signInAs = (role) => { auth.user = role ? { id: 1, name: 'Test', role } : null; auth.loading = false; };

describe('ProtectedRoute', () => {
  it('shows a loader while the session is being restored', () => {
    auth.user = null;
    auth.loading = true;
    renderAt('/dashboard');
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('sends signed-out users to /login with the full path and query as ?next=', () => {
    signInAs(null);
    renderAt('/dashboard?tab=past');
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fdashboard%3Ftab%3Dpast');
  });

  it('renders the page for an allowed role', () => {
    signInAs('PROVIDER');
    renderAt('/dashboard/provider');
    expect(screen.getByText('provider area')).toBeInTheDocument();
  });

  it('allows any signed-in user when no roles are given', () => {
    signInAs('ADMIN');
    renderAt('/any-signed-in');
    expect(screen.getByText('any role')).toBeInTheDocument();
  });

  it.each([
    ['CUSTOMER', '/dashboard/admin', 'customer area'],
    ['PROVIDER', '/dashboard', 'provider area'],
    ['ADMIN', '/dashboard/provider', 'admin area']
  ])('sends a %s on %s to their own dashboard', (role, path, expected) => {
    signInAs(role);
    renderAt(path);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('sends unknown roles to "/" instead of /dashboard', () => {
    signInAs('STAFF');
    renderAt('/dashboard');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });
});
