import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProviderAvailability from './ProviderAvailability';
import { fakeBackend, renderAt } from './testing';
import { addDaysISO, todayInZone } from './lib/time';

const bundle = {
  providerId: 1, businessName: 'Smile Dental Clinic', timezone: 'Asia/Kolkata',
  availability: [
    { id: 1, providerId: 1, dayOfWeek: 1, dayName: 'Monday', startTime: '09:00:00', endTime: '13:00:00', active: true },
    { id: 2, providerId: 1, dayOfWeek: 2, dayName: 'Tuesday', startTime: '09:00:00', endTime: '13:00:00', active: true },
    { id: 91, providerId: 1, staffId: 2, dayOfWeek: 1, dayName: 'Monday', startTime: '10:00:00', endTime: '12:00:00', active: true }
  ],
  blockedDates: [
    { id: 5, providerId: 1, date: addDaysISO(todayInZone('Asia/Kolkata'), 12), available: false, reason: 'Clinic maintenance' }
  ]
};

let calls;
afterEach(() => calls?.restore());

function backend() {
  let nextId = 100;
  calls = fakeBackend((method, path, { body }) => {
    if (method === 'get' && path === '/availability/me') return bundle;
    if (method === 'get' && path === '/provider/staff') return [{ id: 2, name: 'Dr. Arun', active: true, serviceIds: [] }, { id: 3, name: 'Gone', active: false }];
    if (method === 'put' && path === '/availability/week') {
      return body.windows.map((w) => ({ id: nextId++, providerId: 1, staffId: body.staffId, ...w, startTime: `${w.startTime}:00`, endTime: `${w.endTime}:00`, active: true }));
    }
    if (method === 'post' && path === '/availability/blocked') return { id: nextId++, providerId: 1, ...body };
    if (method === 'delete') return null;
    return {};
  });
}

const monday = () => screen.getByRole('group', { name: 'Monday' });

describe('ProviderAvailability', () => {
  it('saves two windows for a day atomically with PUT /availability/week', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAvailability />, { path: '/dashboard/provider/availability' });
    await screen.findByRole('heading', { name: 'Weekly hours — Whole business' });
    expect(screen.getByText('All times are in Asia/Kolkata (IST).')).toBeInTheDocument();

    await user.click(within(monday()).getByRole('button', { name: 'Add hours Monday' }));
    // the new window is suggested after the morning one and receives focus
    const start = within(monday()).getByLabelText('From Monday, window 2');
    expect(start).toHaveValue('14:00');
    expect(start).toHaveFocus();
    fireEvent.change(within(monday()).getByLabelText('To Monday, window 2'), { target: { value: '18:30' } });

    await user.click(screen.getByRole('button', { name: 'Save weekly hours' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'put')).toBe(true));
    expect(calls.find((c) => c.method === 'put').body).toEqual({
      staffId: null,
      windows: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' },
        { dayOfWeek: 1, startTime: '14:00', endTime: '18:30' },
        { dayOfWeek: 2, startTime: '09:00', endTime: '13:00' }
      ]
    });
    expect(await screen.findByText(/^Saved at/)).toHaveAttribute('role', 'status');
  });

  it('blocks saving overlapping or reversed windows and explains why', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAvailability />, { path: '/dashboard/provider/availability' });
    await screen.findByRole('heading', { name: 'Weekly hours — Whole business' });
    await user.click(within(monday()).getByRole('button', { name: 'Add hours Monday' }));
    const start = within(monday()).getByLabelText('From Monday, window 2');
    fireEvent.change(start, { target: { value: '12:00' } });

    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(start).toHaveAccessibleDescription('This overlaps another window on the same day.');

    const tuesday = screen.getByRole('group', { name: 'Tuesday' });
    fireEvent.change(within(tuesday).getByLabelText('To Tuesday, window 1'), { target: { value: '08:00' } });
    expect(within(tuesday).getByText('The start time must be before the end time.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save weekly hours' }));
    expect(screen.getByText('Fix the highlighted hours before saving (problems: 2).')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'put')).toBe(false);
  });

  it('edits one staff member\'s own hours, with the business hours as reference', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAvailability />, { path: '/dashboard/provider/availability' });
    await user.selectOptions(await screen.findByLabelText('Hours for'), 'Dr. Arun');
    expect(screen.getByRole('heading', { name: 'Weekly hours — Dr. Arun' })).toBeInTheDocument();
    expect(within(monday()).getByLabelText('From Monday, window 1')).toHaveValue('10:00');
    expect(within(monday()).getByText(/Business hours:/)).toHaveTextContent('9:00');
    expect(within(screen.getByRole('group', { name: 'Wednesday' })).getByText('Uses the business hours')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy Monday to Tuesday–Friday' }));
    await user.click(screen.getByRole('button', { name: 'Save weekly hours' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'put')).toBe(true));
    const put = calls.find((c) => c.method === 'put').body;
    expect(put.staffId).toBe(2);
    expect(put.windows.map((w) => w.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    expect(put.windows.every((w) => w.startTime === '10:00' && w.endTime === '12:00')).toBe(true);
  });

  it('adds a partial-day block and deletes an existing one', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAvailability />, { path: '/dashboard/provider/availability' });
    await screen.findByText('Clinic maintenance');
    const date = addDaysISO(todayInZone('Asia/Kolkata'), 3);

    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: date } });
    await user.selectOptions(screen.getByLabelText('Applies to'), 'Dr. Arun');
    await user.click(screen.getByRole('radio', { name: /Closed for part of the day/ }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } });
    await user.type(screen.getByLabelText(/^Reason/), 'Conference');
    await user.click(screen.getByRole('button', { name: 'Add date' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'post')).toBe(true));
    expect(calls.find((c) => c.method === 'post').body).toEqual({
      date, staffId: 2, startTime: '15:00', endTime: '17:00', available: false, reason: 'Conference'
    });
    expect(await screen.findByText('Conference')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^Delete/ })[1]);
    await waitFor(() => expect(calls.some((c) => c.method === 'delete' && c.path === '/availability/blocked/5')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Clinic maintenance')).toBeNull());
  });

  it('rejects a block without a date before calling the API', async () => {
    const user = userEvent.setup();
    backend();
    renderAt(<ProviderAvailability />, { path: '/dashboard/provider/availability' });
    await screen.findByText('Clinic maintenance');
    await user.click(screen.getByRole('button', { name: 'Add date' }));
    expect(screen.getByLabelText(/^Date/)).toHaveAccessibleDescription('Choose a date.');
    expect(calls.some((c) => c.method === 'post')).toBe(false);
  });
});
