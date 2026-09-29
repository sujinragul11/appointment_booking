import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProviderServices from './ProviderServices';
import { fakeBackend, httpError, renderAt } from './testing';

const cleaning = {
  id: 1, name: 'Teeth Cleaning', description: 'Scaling', durationMin: 30, bufferMin: 10, price: 400, depositPercent: 0, mode: 'IN_PERSON',
  categoryId: 2, categoryName: 'Dentist', maxAdvanceBookingDays: 30, active: true, staffIds: [2], staffNames: ['Dr. Arun']
};
const staff = [
  { id: 2, name: 'Dr. Arun', designation: 'Endodontist', active: true, serviceIds: [1] },
  { id: 3, name: 'Former Member', active: false, serviceIds: [] }
];

let calls;
afterEach(() => calls?.restore());

function backend(handlers = {}) {
  calls = fakeBackend((method, path, call) => {
    const custom = handlers[`${method} ${path}`];
    if (custom) return custom(call);
    if (method === 'get' && path === '/provider/services') return [cleaning];
    if (method === 'get' && path === '/provider/staff') return staff;
    if (method === 'get' && path === '/categories') return [{ id: 2, name: 'Dentist' }, { id: 5, name: 'Salon & Spa' }];
    if (method === 'get' && path === '/provider/me') return { id: 1, policy: { maxAdvanceBookingDays: 30 } };
    return {};
  });
  return calls;
}

const openAddForm = async (user) => {
  renderAt(<ProviderServices />, { path: '/dashboard/provider/services' });
  await screen.findByRole('button', { name: 'Edit Teeth Cleaning' });
  await user.click(screen.getByRole('button', { name: /Add service/ }));
  return screen.findByRole('dialog', { name: 'Add a service' });
};

describe('ProviderServices', () => {
  it('creates a service with every FR-9 field and shows it in the list', async () => {
    const user = userEvent.setup();
    backend({
      'post /provider/services': ({ body }) => ({ id: 9, ...body, categoryName: 'Dentist', staffNames: ['Dr. Arun'] })
    });
    const dialog = await openAddForm(user);
    const d = within(dialog);

    // inactive staff are not offered
    expect(d.queryByLabelText(/Former Member/)).toBeNull();

    await user.type(d.getByLabelText(/Service name/), 'Teeth Whitening');
    await user.type(d.getByLabelText(/Description/), 'Laser whitening');
    await user.selectOptions(d.getByLabelText('Category'), 'Dentist');
    await user.clear(d.getByLabelText(/Duration/));
    await user.type(d.getByLabelText(/Duration/), '45');
    await user.clear(d.getByLabelText(/Buffer time/));
    await user.type(d.getByLabelText(/Buffer time/), '15');
    await user.type(d.getByLabelText(/Price/), '2500');
    await user.clear(d.getByLabelText(/Deposit/));
    await user.type(d.getByLabelText(/Deposit/), '20');
    await user.click(d.getByRole('radio', { name: /Online/ }));
    await user.click(d.getByRole('checkbox', { name: /Dr. Arun/ }));
    await user.click(d.getByRole('button', { name: 'Create service' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const post = calls.find((c) => c.method === 'post' && c.path === '/provider/services');
    expect(post.body).toEqual({
      name: 'Teeth Whitening', description: 'Laser whitening', categoryId: 2, durationMin: 45, bufferMin: 15, price: 2500,
      depositPercent: 20, mode: 'ONLINE', maxAdvanceBookingDays: 0, imageUrl: '', active: true, staffIds: [2]
    });
    expect(screen.getByRole('button', { name: 'Edit Teeth Whitening' })).toBeInTheDocument();
    expect(await screen.findByText('Teeth Whitening added')).toBeInTheDocument();
  });

  it('validates ranges before sending anything', async () => {
    const user = userEvent.setup();
    backend();
    const dialog = await openAddForm(user);
    const d = within(dialog);
    await user.type(d.getByLabelText(/Service name/), 'Quick check');
    await user.clear(d.getByLabelText(/Duration/));
    await user.type(d.getByLabelText(/Duration/), '600');
    await user.type(d.getByLabelText(/Price/), '100');
    await user.click(d.getByRole('button', { name: 'Create service' }));

    const duration = d.getByLabelText(/Duration/);
    expect(duration).toHaveAttribute('aria-invalid', 'true');
    expect(duration).toHaveAccessibleDescription(/Enter a whole number from 5 to 480/);
    expect(duration).toHaveFocus();
    expect(d.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
    expect(calls.some((c) => c.method === 'post')).toBe(false);
  });

  it('shows the backend validation messages next to their fields', async () => {
    const user = userEvent.setup();
    backend({
      'post /provider/services': () => {
        throw httpError(400, { status: 400, message: 'Buffer is too long for this service', errors: { bufferMin: 'Buffer is too long for this service' } });
      }
    });
    const dialog = await openAddForm(user);
    const d = within(dialog);
    await user.type(d.getByLabelText(/Service name/), 'Consultation');
    await user.type(d.getByLabelText(/Price/), '300');
    await user.click(d.getByRole('button', { name: 'Create service' }));

    const buffer = await d.findByLabelText(/Buffer time/);
    await waitFor(() => expect(buffer).toHaveAttribute('aria-invalid', 'true'));
    expect(buffer).toHaveAccessibleDescription(/Buffer is too long for this service/);
    expect(d.getByRole('alert')).toHaveTextContent('Buffer time (minutes): Buffer is too long for this service');
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // stays open with the input kept
    expect(d.getByLabelText(/Service name/)).toHaveValue('Consultation');
  });

  it('edits a service: booking window equal to the business default is shown and saved as 0', async () => {
    const user = userEvent.setup();
    backend({ 'put /provider/services/1': ({ body }) => ({ ...cleaning, ...body, maxAdvanceBookingDays: 30 }) });
    renderAt(<ProviderServices />, { path: '/dashboard/provider/services' });
    await user.click(await screen.findByRole('button', { name: 'Edit Teeth Cleaning' }));
    const d = within(await screen.findByRole('dialog', { name: 'Edit Teeth Cleaning' }));
    expect(d.getByLabelText(/Bookable up to/)).toHaveValue(0);
    expect(d.getByRole('checkbox', { name: /Dr. Arun/ })).toBeChecked();
    await user.clear(d.getByLabelText(/Price/));
    await user.type(d.getByLabelText(/Price/), '450');
    await user.click(d.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'put')).toBe(true));
    expect(calls.find((c) => c.method === 'put').body).toMatchObject({ price: 450, maxAdvanceBookingDays: 0, staffIds: [2], categoryId: 2 });
  });

  it('enables / disables a service with the switch', async () => {
    const user = userEvent.setup();
    backend({ 'patch /provider/services/1/active': ({ body }) => ({ ...cleaning, active: body.active }) });
    renderAt(<ProviderServices />, { path: '/dashboard/provider/services' });
    const toggle = await screen.findByRole('switch', { name: 'Bookable: Teeth Cleaning' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(calls.find((c) => c.method === 'patch').body).toEqual({ active: false });
  });
});
