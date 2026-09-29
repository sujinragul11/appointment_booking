import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Calendar from './Calendar';

const day = (iso) => document.querySelector(`[data-date="${iso}"]`);

function setup(props = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Calendar value="2026-10-15" onChange={onChange} {...props} />);
  return { onChange, user };
}

describe('Calendar', () => {
  it('shows the month of the selected value with labelled days', () => {
    setup();
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('abbr', 'Monday');
    const selected = screen.getByRole('button', { name: 'Thursday, 15 October 2026' });
    expect(selected.closest('td')).toHaveAttribute('aria-selected', 'true');
    expect(day('2026-10-16').closest('td')).toHaveAttribute('aria-selected', 'false');
  });

  it('uses a roving tabindex: only the focused day is tabbable', () => {
    setup();
    const tabbable = Array.from(document.querySelectorAll('.calendar-day')).filter((b) => b.tabIndex === 0);
    expect(tabbable).toEqual([day('2026-10-15')]);
  });

  it('calls onChange with a yyyy-mm-dd string when a day is clicked', async () => {
    const { onChange, user } = setup();
    await user.click(day('2026-10-20'));
    expect(onChange).toHaveBeenCalledWith('2026-10-20');
  });

  it('marks disabled days and ignores clicks on them', async () => {
    const { onChange, user } = setup({ isDisabled: (iso) => iso === '2026-10-17' });
    expect(day('2026-10-17')).toHaveAttribute('aria-disabled', 'true');
    await user.click(day('2026-10-17'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('respects minDate/maxDate for days and month navigation', () => {
    setup({ minDate: '2026-10-10', maxDate: '2026-10-31' });
    expect(day('2026-10-09')).toHaveAttribute('aria-disabled', 'true');
    expect(day('2026-10-10')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('navigates months with the header buttons', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeInTheDocument();
  });

  it('supports arrow keys, Home/End and PageUp/PageDown', async () => {
    const { user } = setup();
    day('2026-10-15').focus();

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(day('2026-10-16'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(day('2026-10-23'));
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(document.activeElement).toBe(day('2026-10-15'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(day('2026-10-12')); // Monday
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(day('2026-10-18')); // Sunday
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    expect(document.activeElement).toBe(day('2026-11-18'));
    await user.keyboard('{PageUp}{PageUp}');
    expect(document.activeElement).toBe(day('2026-09-18'));
  });

  it('crosses month boundaries with the arrows and selects with Enter', async () => {
    const { onChange, user } = setup({ value: '2026-10-31' });
    day('2026-10-31').focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    expect(document.activeElement).toBe(day('2026-11-01'));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-11-01');
  });

  it('does not move focus outside minDate/maxDate', async () => {
    const { user } = setup({ value: '2026-10-10', minDate: '2026-10-10', maxDate: '2026-10-12' });
    day('2026-10-10').focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(day('2026-10-10'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(day('2026-10-12'));
  });
});
