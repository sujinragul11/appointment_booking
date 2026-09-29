import { describe, expect, it } from 'vitest';
import { isOpenSlot, parseSlots } from './slots';

describe('parseSlots', () => {
  it('accepts the legacy array response', () => {
    const slots = [{ id: 1, startTime: '10:00:00', status: 'AVAILABLE' }];
    expect(parseSlots(slots)).toEqual({ slots, message: '' });
  });

  it('accepts the { slots, closed, message } envelope', () => {
    const slots = [{ startTime: '10:00:00', status: 'AVAILABLE' }];
    expect(parseSlots({ closed: false, message: null, slots })).toEqual({ slots, message: '' });
    expect(parseSlots({ closed: true, message: 'Closed for Diwali', slots: [] })).toEqual({ slots: [], message: 'Closed for Diwali' });
  });

  it('never throws on unexpected data', () => {
    expect(parseSlots(undefined)).toEqual({ slots: [], message: '' });
    expect(parseSlots('oops')).toEqual({ slots: [], message: '' });
  });

  it('treats only AVAILABLE (or unspecified) slots as bookable', () => {
    expect(['AVAILABLE', 'BOOKED', 'BLOCKED', 'HELD', undefined].map((status) => isOpenSlot({ status })))
      .toEqual([true, false, false, false, true]);
  });
});
