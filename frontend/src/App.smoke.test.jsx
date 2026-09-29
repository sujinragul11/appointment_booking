import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { I18nProvider } from './i18n';
import api from './api/client';
import { todayISO } from './utils/format';

/* Renders every route for each role against a fake backend and fails on crashes
 * (error boundary) or React warnings (keys, invalid DOM nesting, ...). */

const today = todayISO();
const USERS = {
  CUSTOMER: { id: 1, name: 'Rajesh Kumar', email: 'customer@booking.com', role: 'CUSTOMER', createdAt: '2026-01-01T10:00:00' },
  PROVIDER: { id: 2, name: 'Dr. Smile', email: 'provider@booking.com', role: 'PROVIDER', providerId: 1 },
  ADMIN: { id: 3, name: 'Platform Admin', email: 'admin@booking.com', role: 'ADMIN' }
};

const provider = {
  id: 1, businessName: 'Smile Dental Clinic', description: 'Family dentistry', city: 'Chennai', state: 'TN',
  country: 'India', phone: '+919876543210', status: 'VERIFIED', rating: 4.5, reviewCount: 10, maxAdvanceBookingDays: 30,
  cancellationPolicy: 'Free up to 24h before', timezone: 'Asia/Kolkata', category: { id: 2, name: 'Dentist', icon: 'D' },
  services: [
    { id: 11, name: 'Cleaning', durationMin: 30, bufferMin: 10, price: 500, active: true, staffIds: [21] },
    { id: 12, name: 'Retired service', durationMin: 30, bufferMin: 0, price: 100, active: false, staffIds: [] }
  ],
  staff: [
    { id: 21, name: 'Dr. Asha', designation: 'Dentist', active: true, serviceIds: [11] },
    { id: 22, name: 'Former member', designation: 'Hygienist', active: false, serviceIds: [11] }
  ],
  branches: [{ id: 31, name: 'Main', main: true, address: '1 Road', city: 'Chennai' }]
};

const appt = (over) => ({
  id: 5, bookingRef: 'BK5', providerId: 1, providerName: 'Smile Dental Clinic', serviceId: 11, serviceName: 'Cleaning',
  staffId: 21, staffName: 'Dr. Asha', customerName: 'Rajesh Kumar', date: today, startTime: '10:00:00', endTime: '10:30:00',
  status: 'PENDING', amount: 500, discount: 0, finalAmount: 500, payment: { method: 'RAZORPAY', status: 'PENDING' },
  createdAt: '2026-09-01T10:00:00', ...over
});

const allDays = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ id: d, dayOfWeek: d, dayName: `Day ${d}`, startTime: '09:00:00', endTime: '18:00:00', active: true }));

function routeData(method, path, config) {
  if (method === 'get') {
    if (path === '/auth/me') return USERS[localStorage.getItem('testRole')];
    if (path === '/categories') return [{ id: 1, name: 'Doctor', icon: 'H', slug: 'doctor' }, { id: 2, name: 'Dentist', icon: 'D', slug: 'dentist' }];
    if (path === '/providers') return { content: [provider], page: 0, size: 9, totalPages: 1, totalElements: 1 };
    if (path === '/providers/1') return provider;
    if (path === '/providers/1/reviews') return [{ id: 1, customerName: 'Anu', rating: 5, comment: 'Great', createdAt: '2026-09-01T10:00:00' }];
    if (path === '/providers/1/availability' || path === '/availability/1') return { providerId: 1, availability: allDays, overrides: [] };
    if (path === '/slots') {
      return [
        { id: 101, startTime: '10:00:00', endTime: '10:30:00', status: 'AVAILABLE', date: config.params?.date },
        { id: 102, startTime: '11:00:00', endTime: '11:30:00', status: 'BOOKED', date: config.params?.date }
      ];
    }
    if (path === '/appointments/my') {
      return [appt(), appt({ id: 6, bookingRef: 'BK6', status: 'COMPLETED', date: '2026-01-10' }), appt({ id: 7, bookingRef: 'BK7', status: 'CANCELLED' })];
    }
    if (/^\/appointments\/\d+$/.test(path)) return appt({ id: Number(path.split('/')[2]) });
    if (path === '/notifications') return [{ id: 1, title: 'Booking confirmed', message: 'See you soon', type: 'BOOKING', read: false, createdAt: '2026-09-01T10:00:00' }];
    if (path === '/notifications/unread-count') return { unread: 1 };
    if (path === '/addresses') return [{ id: 1, label: 'Home', addressLine: '1 Road', city: 'Chennai', defaultAddress: true }];
    if (path === '/provider/me') return provider;
    if (path === '/provider/stats') return { todayAppointments: 1, upcomingAppointments: 2, completedAppointments: 3, cancelledAppointments: 0, monthlyRevenue: 1500, rating: 4.5, reviewCount: 10 };
    if (path === '/appointments/provider') return [appt({ status: 'RESCHEDULED' }), appt({ id: 8, bookingRef: 'BK8', status: 'IN_PROGRESS' })];
    if (path === '/appointments/provider/today') return [appt({ status: 'CONFIRMED' })];
    if (path === '/staff/provider/1') return provider.staff;
    if (path === '/admin/stats') return { totalUsers: 3, totalCustomers: 1, totalProviders: 1, pendingProviders: 1, totalAppointments: 3, pendingAppointments: 1, totalSlots: 4, totalReviews: 1, totalRevenue: 1500 };
    if (path === '/admin/providers/pending') return [{ ...provider, id: 9, status: 'PENDING', createdAt: '2026-09-01T10:00:00' }];
    if (path === '/admin/users') return { content: Object.values(USERS), page: 0, size: 20, totalPages: 1, totalElements: 3 };
    if (path === '/admin/coupons') return [{ id: 1, code: 'FIRST50', discountType: 'PERCENT', value: 50, minOrder: 0, maxDiscount: 200, usedCount: 1, usageLimit: 10, active: true }];
  }
  if (method === 'post') {
    if (path === '/appointments') return appt({ id: 42, bookingRef: 'BK42', status: JSON.parse(config.data).paymentMethod === 'PAY_AT_VENUE' ? 'CONFIRMED' : 'PENDING' });
    if (path === '/payments/create-order') return { orderId: 'order_1', amount: 500 };
    if (path === '/auth/logout') return { success: true };
  }
  return {};
}

let calls;
let originalAdapter;
let consoleErrors;

beforeEach(() => {
  calls = [];
  originalAdapter = api.defaults.adapter;
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.map(String).join(' ')); });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  api.defaults.adapter = async (config) => {
    const path = config.url.split('?')[0];
    calls.push({ method: config.method, path, params: config.params });
    return { data: routeData(config.method, path, config), status: 200, statusText: 'OK', headers: {}, config, request: {} };
  };
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderApp(path, role) {
  if (role) {
    localStorage.setItem('testRole', role);
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('refreshToken', 'refresh');
    localStorage.setItem('user', JSON.stringify(USERS[role]));
  }
  return render(
    <I18nProvider initialLanguage="en">
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>
  );
}

async function expectPageRenders(path, role) {
  renderApp(path, role);
  const main = document.getElementById('main');
  await waitFor(() => expect(within(main).getByRole('heading', { level: 1 })).toBeInTheDocument());
  await waitFor(() => expect(main.querySelector('.loader-screen')).toBeNull());
  expect(within(main).queryByText('Something went wrong')).toBeNull();
  expect(consoleErrors).toEqual([]);
}

const PAGES = {
  guest: ['/', '/providers', '/providers?category=Dentist', '/categories', '/providers/1', '/book/1/11', '/login', '/register', '/404'],
  CUSTOMER: ['/', '/book/1/11', '/book/1/12', '/dashboard', '/dashboard?tab=past', '/dashboard?tab=cancelled', '/appointments/5', '/addresses', '/profile', '/notifications'],
  PROVIDER: ['/dashboard/provider', '/dashboard/provider/appointments', '/dashboard/provider/services', '/dashboard/provider/staff',
    '/dashboard/provider/availability', '/dashboard/provider/earnings', '/dashboard/provider/settings', '/profile', '/notifications'],
  ADMIN: ['/dashboard/admin', '/dashboard/admin/providers', '/dashboard/admin/users', '/dashboard/admin/coupons', '/profile']
};

describe('every page renders without errors', () => {
  Object.entries(PAGES).forEach(([role, paths]) => {
    it.each(paths)(`${role}: %s`, (path) => expectPageRenders(path, role === 'guest' ? null : role));
  });
});

describe('page behaviour', () => {
  it('resolves ?category=<name> from the home chips to a categoryId search', async () => {
    renderApp('/providers?category=Dentist');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/providers?categoryId=2'));
    await waitFor(() => expect(calls.some((c) => c.path === '/providers' && c.params?.categoryId === '2')).toBe(true));
    expect(calls.some((c) => c.path === '/providers' && !c.params?.categoryId)).toBe(false);
  });

  it('customer tabs split bookings into upcoming / past / cancelled', async () => {
    const user = userEvent.setup();
    renderApp('/dashboard', 'CUSTOMER');
    await waitFor(() => expect(screen.getAllByRole('tab').map((t) => t.textContent))
      .toEqual(['Upcoming (1)', 'Past (1)', 'Cancelled (1)']));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('BK5');
    await user.click(screen.getByRole('tab', { name: /Past/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('BK6');
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard?tab=past');
  });

  it('pending unpaid appointments offer Pay now, Reschedule and Cancel', async () => {
    renderApp('/appointments/5', 'CUSTOMER');
    expect(await screen.findByRole('button', { name: 'Pay now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reschedule' })).toBeInTheDocument();
  });

  it('reschedule loads slots for the same staff member', async () => {
    const user = userEvent.setup();
    renderApp('/appointments/5', 'CUSTOMER');
    await user.click(await screen.findByRole('button', { name: 'Reschedule' }));
    await screen.findByRole('button', { name: '10:00 AM' });
    expect(calls.find((c) => c.path === '/slots').params).toMatchObject({ providerId: 1, serviceId: 11, staffId: 21 });
  });

  it('booking hides inactive services/staff and confirms a pay-at-venue booking', async () => {
    const user = userEvent.setup();
    renderApp('/book/1/11', 'CUSTOMER');
    await screen.findByRole('heading', { name: 'Book your appointment' });
    expect(screen.queryByText('Retired service')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Former member' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show calendar for more dates' }));
    expect(screen.getByRole('grid')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '10:00 AM to 10:30 AM' }));
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/book/success/42'));
  });

  it('closing the payment dialog keeps the booking and opens it instead of cancelling', async () => {
    const user = userEvent.setup();
    renderApp('/book/1/11', 'CUSTOMER');
    await user.click(await screen.findByRole('button', { name: '10:00 AM to 10:30 AM' }));
    await user.selectOptions(screen.getByLabelText('Payment method'), 'RAZORPAY');
    await user.click(screen.getByRole('button', { name: 'Proceed to payment' }));
    await screen.findByRole('dialog', { name: 'Demo payment' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/appointments/42'));
    expect(calls.some((c) => c.path.endsWith('/fail'))).toBe(false);
    expect(await screen.findByText(/reserved but not paid yet/)).toBeInTheDocument();
  });

  it('editing an applied coupon clears the discount', async () => {
    const user = userEvent.setup();
    api.defaults.adapter = async (config) => {
      const path = config.url.split('?')[0];
      const data = path === '/coupons/validate' ? { valid: true, discount: 100, message: 'ok' } : routeData(config.method, path, config);
      return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} };
    };
    renderApp('/book/1/11', 'CUSTOMER');
    const input = await screen.findByLabelText('Coupon code');
    await user.type(input, 'first50');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('You save ₹100')).toBeInTheDocument();
    await user.type(input, 'X');
    expect(screen.queryByText('You save ₹100')).toBeNull();
    expect(input).toHaveValue('FIRST50X');
  });
});
