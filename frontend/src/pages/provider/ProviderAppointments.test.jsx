import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProviderAppointments from './ProviderAppointments';
import { fakeBackend, renderAt } from './testing';
import { addDaysISO, mondayOf, todayInZone } from './lib/time';

const today = todayInZone('Asia/Kolkata');
const none = { canCancel: false, canReschedule: false, canPay: false, canReview: false, canConfirm: false, canReject: false, canComplete: false, canMarkNoShow: false, canAddNotes: false };
const appt = (over) => ({
  id: 5, bookingRef: 'BK-5', customerName: 'Rajesh Kumar', customerPhone: '+919876543210', customerEmail: 'customer@booking.com',
  serviceName: 'Dental Checkup', staffName: 'Dr. Arun', date: today, startTime: '11:00:00', endTime: '11:20:00', timezone: 'Asia/Kolkata',
  status: 'PENDING', mode: 'IN_PERSON', finalAmount: 300, paymentStatus: 'PENDING',
  payment: { id: 50, method: 'PAY_AT_VENUE', status: 'PENDING', amount: 0, balanceDue: 300 },
  actions: { ...none, canConfirm: true, canReject: true, canCancel: true }, ...over
});
const pending = appt();
const started = appt({
  id: 6, bookingRef: 'BK-6', customerName: 'Anita Desai', status: 'CONFIRMED', startTime: '09:00:00', endTime: '09:30:00',
  payment: { id: 60, method: 'PAY_AT_VENUE', status: 'PENDING', amount: 0, balanceDue: 500 }, finalAmount: 500,
  actions: { ...none, canCancel: true, canComplete: true, canMarkNoShow: true }
});
const cancelled = appt({ id: 7, bookingRef: 'BK-7', customerName: 'Old Booking', status: 'CANCELLED', payment: { balanceDue: 300, status: 'FAILED' }, actions: none });

let calls;
afterEach(() => calls?.restore());

function backend(extra = {}) {
  calls = fakeBackend((method, path, call) => {
    const custom = extra[`${method} ${path}`];
    if (custom) return custom(call);
    if (method === 'get' && path === '/provider/me') return { id: 1, timezone: 'Asia/Kolkata' };
    if (method === 'get' && path === '/provider/staff') return [{ id: 2, name: 'Dr. Arun', active: true }];
    if (method === 'get' && path === '/availability/me') return { timezone: 'Asia/Kolkata', availability: [{ dayOfWeek: 1, startTime: '09:00:00', endTime: '18:00:00', active: true }], blockedDates: [] };
    if (method === 'get' && path === '/provider/appointments') {
      return { content: [pending, started, cancelled], page: 0, size: 20, totalElements: 3, totalPages: 1 };
    }
    if (method === 'put' && path.endsWith('/status')) {
      const id = Number(path.split('/')[2]);
      const base = [pending, started].find((a) => a.id === id);
      return { ...base, status: call.body.status, cancelReason: call.body.reason, actions: { ...none, canCancel: call.body.status === 'CONFIRMED' } };
    }
    if (method === 'post' && path === '/provider/appointments/6/collect') {
      return { id: 60, appointmentId: 6, method: 'PAY_AT_VENUE', status: 'SUCCESS', amount: 500, balanceDue: 0, invoiceNumber: 'INV-1' };
    }
    return {};
  });
}

const row = (ref) => screen.getByText(ref, { selector: '.pp-ref' }).closest('tr');

describe('ProviderAppointments – list view actions', () => {
  it('confirms a pending booking', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?view=list' });
    await user.click(await screen.findByRole('button', { name: 'Confirm BK-5' }));
    await waitFor(() => expect(within(row('BK-5')).getByText('Confirmed')).toBeInTheDocument());
    expect(calls.find((c) => c.method === 'put')).toMatchObject({ path: '/appointments/5/status', body: { status: 'CONFIRMED' } });
    expect(within(row('BK-5')).queryByRole('button', { name: 'Confirm BK-5' })).toBeNull();
    expect(await screen.findByText('Booking BK-5 confirmed')).toBeInTheDocument();
  });

  it('requires a reason to reject, then sends it with CANCELLED', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?view=list' });
    await user.click(await screen.findByRole('button', { name: 'Reject BK-5' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject booking BK-5' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject booking' }));
    const reason = within(dialog).getByLabelText(/Reason/);
    expect(reason).toHaveAccessibleDescription(/Please give a reason\./);
    expect(reason).toHaveFocus();
    expect(calls.some((c) => c.method === 'put')).toBe(false);

    await user.type(reason, 'Doctor unavailable that day');
    await user.click(within(dialog).getByRole('button', { name: 'Reject booking' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => c.method === 'put').body).toEqual({ status: 'CANCELLED', reason: 'Doctor unavailable that day' });
    expect(within(row('BK-5')).getByText('Cancelled')).toBeInTheDocument();
  });

  it('offers complete / no-show / payment only where the flags and balance allow', async () => {
    backend();
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?view=list' });
    await screen.findByRole('button', { name: 'Complete BK-6' });
    const r5 = within(row('BK-5'));
    const r6 = within(row('BK-6'));
    const r7 = within(row('BK-7'));
    expect(r5.queryByRole('button', { name: /Complete/ })).toBeNull();
    expect(r5.getByRole('button', { name: 'Record payment BK-5' })).toBeInTheDocument();
    expect(r6.getByRole('button', { name: 'No-show BK-6' })).toBeInTheDocument();
    expect(r6.getByRole('button', { name: 'Cancel booking BK-6' })).toBeInTheDocument();
    expect(r6.queryByRole('button', { name: /Reject/ })).toBeNull();
    // cancelled: nothing to do but open the details, even though money was due
    expect(r7.queryAllByRole('button')).toHaveLength(0);
    expect(r7.getByRole('link', { name: 'Details BK-7' })).toHaveAttribute('href', '/appointments/7');
  });

  it('completes, marks no-show after confirmation, and records payment collected', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?view=list' });

    await user.click(await screen.findByRole('button', { name: 'Record payment BK-6' }));
    const pay = await screen.findByRole('dialog', { name: 'Record payment for BK-6' });
    expect(pay).toHaveTextContent('₹500');
    await user.click(within(pay).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => c.method === 'post').path).toBe('/provider/appointments/6/collect');
    expect(within(row('BK-6')).queryByText('Due ₹500')).toBeNull();
    expect(within(row('BK-6')).queryByRole('button', { name: /Record payment/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'No-show BK-6' }));
    const noShow = await screen.findByRole('dialog', { name: 'Mark BK-6 as a no-show?' });
    await user.click(within(noShow).getByRole('button', { name: 'Mark as no-show' }));
    await waitFor(() => expect(within(row('BK-6')).getByText('No-show')).toBeInTheDocument());
    expect(calls.filter((c) => c.method === 'put').map((c) => c.body)).toEqual([{ status: 'NO_SHOW' }]);
  });

  it('marks a started booking completed', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?view=list' });
    await user.click(await screen.findByRole('button', { name: 'Complete BK-6' }));
    await waitFor(() => expect(within(row('BK-6')).getByText('Completed')).toBeInTheDocument());
    expect(calls.find((c) => c.method === 'put')).toMatchObject({ path: '/appointments/6/status', body: { status: 'COMPLETED' } });
  });

  it('shows the backend message when an action is refused', async () => {
    const user = userEvent.setup();
    backend({
      'put /appointments/6/status': () => {
        const err = new Error('Request failed');
        err.isAxiosError = true;
        err.response = { status: 400, data: { message: 'This can be recorded once the appointment time has started' } };
        throw err;
      }
    });
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?view=list' });
    await user.click(await screen.findByRole('button', { name: 'Complete BK-6' }));
    expect(await screen.findByText('This can be recorded once the appointment time has started')).toBeInTheDocument();
    expect(within(row('BK-6')).getByText('Confirmed')).toBeInTheDocument();
  });
});

describe('ProviderAppointments – filters, ?ref= and export', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('pre-fills the search from a notification link (?ref=) and queries it', async () => {
    backend();
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?ref=BK-260929-VTJSBR' });
    expect(await screen.findByRole('searchbox', { name: 'Search appointments' })).toHaveValue('BK-260929-VTJSBR');
    await waitFor(() => expect(calls.some((c) => c.path === '/provider/appointments' && c.params.q === 'BK-260929-VTJSBR')).toBe(true));
    expect(screen.getByRole('button', { name: /List/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters by status and date range and exports with the same filters', async () => {
    const user = userEvent.setup();
    backend({
      'get /provider/appointments/export': () => new Blob(['ref,customer'], { type: 'text/csv' })
    });
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments?view=list' });
    await screen.findByRole('button', { name: 'Confirm BK-5' });
    await user.selectOptions(screen.getByLabelText('Status'), 'PENDING');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('status=PENDING'));
    await waitFor(() => expect(calls.some((c) => c.path === '/provider/appointments' && c.params.status === 'PENDING' && c.params.size === 20)).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/provider/appointments/export')).toBe(true));
    expect(calls.find((c) => c.path === '/provider/appointments/export').params).toEqual({ format: 'csv', status: 'PENDING' });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(await screen.findByText('Downloaded appointments.csv')).toBeInTheDocument();
  });
});

describe('ProviderAppointments – week view', () => {
  it('loads the provider-local week and links every block to the appointment page', async () => {
    backend();
    renderAt(<ProviderAppointments />, { path: '/dashboard/provider/appointments' });
    const link = await screen.findByRole('link', { name: /Rajesh Kumar, Dental Checkup, Dr. Arun, Pending/ });
    expect(link).toHaveAttribute('href', '/appointments/5');
    const monday = mondayOf(today);
    expect(calls.find((c) => c.path === '/provider/appointments').params).toMatchObject({ from: monday, to: addDaysISO(monday, 6), size: 200 });
    // cancelled bookings are hidden until asked for
    expect(screen.queryByRole('link', { name: /Old Booking/ })).toBeNull();
  });
});
