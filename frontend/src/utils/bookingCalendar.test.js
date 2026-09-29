import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bookingWindow, closedDayChecker, firstOpenDate, formatClock, formatDay, formatInstant, formatStamp, formatWhen, hhmm, isoWeekday,
  todayInZone, viewerClock
} from './bookingCalendar';

// The viewer sits in India for these tests; providers may be elsewhere.
process.env.TZ = 'Asia/Kolkata';

afterEach(() => vi.useRealTimers());

// 2026-10-05 is a Monday.
const window = (dayOfWeek, staffId = null, active = true) => ({ dayOfWeek, staffId, active, startTime: '09:00:00', endTime: '17:00:00' });

describe('todayInZone / bookingWindow', () => {
  it("uses the provider's calendar date, not the viewer's", () => {
    const instant = new Date('2026-10-04T20:00:00Z'); // 5 Oct 01:30 in India, still 4 Oct in London and New York
    expect(todayInZone('Asia/Kolkata', instant)).toBe('2026-10-05');
    expect(todayInZone('Europe/London', instant)).toBe('2026-10-04');
    expect(todayInZone('America/New_York', instant)).toBe('2026-10-04');
  });

  it('falls back to the local date without a valid zone', () => {
    expect(todayInZone('', new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05');
    expect(todayInZone('Not/AZone', new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
  });

  it('spans today .. today + maxDays (default 30)', () => {
    const now = new Date('2026-10-05T06:00:00Z');
    expect(bookingWindow('Asia/Kolkata', 10, now)).toEqual({ today: '2026-10-05', maxDate: '2026-10-15' });
    expect(bookingWindow('Asia/Kolkata', 0, now).maxDate).toBe('2026-11-04');
  });
});

describe('closedDayChecker', () => {
  it('uses ISO weekdays (1 = Monday ... 7 = Sunday)', () => {
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-11')).toBe(7);
    expect(isoWeekday('nope')).toBeNull();
  });

  it('closes weekdays without provider hours and ignores inactive windows', () => {
    const closed = closedDayChecker({ availability: [window(1), window(2), window(3, null, false)], blockedDates: [] });
    expect(closed('2026-10-05')).toBe(false); // Monday
    expect(closed('2026-10-06')).toBe(false); // Tuesday
    expect(closed('2026-10-07')).toBe(true); // Wednesday: window inactive
    expect(closed('2026-10-11')).toBe(true); // Sunday
  });

  it('closes full-day provider blocks but not partial ones; custom hours open a closed weekday', () => {
    const closed = closedDayChecker({
      availability: [window(1), window(2)],
      blockedDates: [
        { date: '2026-10-05', staffId: null, available: false },
        { date: '2026-10-06', staffId: null, available: false, startTime: '12:00:00', endTime: '13:00:00' },
        { date: '2026-10-11', staffId: null, available: true, startTime: '10:00:00', endTime: '14:00:00' }
      ]
    });
    expect(closed('2026-10-05')).toBe(true);
    expect(closed('2026-10-06')).toBe(false);
    expect(closed('2026-10-11')).toBe(false);
  });

  it('opens a day when any team member works it (own hours, provider hours or custom hours)', () => {
    const bundle = {
      availability: [window(1), window(2), window(3, 7), window(6, 8)],
      blockedDates: [
        { date: '2026-10-12', staffId: 7, available: false }, // staff 7 off on a Monday
        { date: '2026-10-11', staffId: 8, available: true, startTime: '10:00:00', endTime: '12:00:00' } // staff 8 works a Sunday
      ]
    };
    const both = closedDayChecker(bundle, [7, 8]);
    expect(both('2026-10-07')).toBe(false); // Wednesday: staff 7's own hours
    expect(both('2026-10-10')).toBe(false); // Saturday: staff 8's own hours
    expect(both('2026-10-05')).toBe(false); // Monday: provider hours apply to both
    expect(both('2026-10-08')).toBe(true); // Thursday: nobody
    expect(both('2026-10-11')).toBe(false); // Sunday: staff 8 custom hours

    const seven = closedDayChecker(bundle, ['7']);
    expect(seven('2026-10-12')).toBe(true); // day off
    expect(seven('2026-10-19')).toBe(false); // next Monday
    expect(seven('2026-10-10')).toBe(true); // Saturday belongs to staff 8
  });

  it('closes everything when a staff-based provider publishes no hours, and nothing without data', () => {
    expect(closedDayChecker({ availability: [], blockedDates: [] }, [1])('2026-10-05')).toBe(true);
    expect(closedDayChecker(null)('2026-10-05')).toBe(false);
    expect(closedDayChecker(undefined, [1])('2026-10-05')).toBe(false);
  });

  it('finds the first open date in a range', () => {
    const closed = closedDayChecker({ availability: [window(3)], blockedDates: [] });
    expect(firstOpenDate('2026-10-05', '2026-10-31', closed)).toBe('2026-10-07');
    expect(firstOpenDate('2026-10-08', '2026-10-13', closed)).toBeNull();
    expect(firstOpenDate(null, '2026-10-13', closed)).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats wall-clock times in English and in the UI language', () => {
    expect(formatClock('09:05:00', 'en-IN')).toBe('9:05 AM');
    expect(formatClock('17:30')).toBe('5:30 PM');
    expect(formatClock('17:30', 'hi-IN')).toMatch(/5:30/);
    expect(formatClock('')).toBe('');
    expect(hhmm('09:05:00')).toBe('09:05');
  });

  it('formats a day and an appointment with its zone', () => {
    // ICU versions differ in punctuation ("5 Oct 2026" / "5 Oct, 2026")
    expect(formatDay('2026-10-05', 'en-IN')).toMatch(/^Mon, 5 Oct,? 2026$/);
    const text = formatWhen({ date: '2026-10-05', startTime: '10:00:00', endTime: '10:30:00', timezone: 'Asia/Kolkata' }, 'en-IN');
    expect(text).toMatch(/^Mon, 5 Oct,? 2026 · 10:00 AM – 10:30 AM (IST|GMT\+5:30)$/);
    expect(formatWhen({ date: '2026-10-05' }, 'en-IN')).toMatch(/^Mon, 5 Oct,? 2026$/);
    expect(formatWhen({}, 'en-IN')).toBe('');
  });

  it("adds the viewer's own time only when it differs from the provider's", () => {
    // 09:00 in London (BST) is 13:30 in India
    expect(viewerClock('2026-10-05T08:00:00Z', 'Europe/London', 'en-IN')).toMatch(/1:30\s?PM/);
    expect(viewerClock('2026-10-05T04:30:00Z', 'Asia/Kolkata', 'en-IN')).toBe('');
    // 21:00 in New York is the next morning in India: the weekday is added
    expect(viewerClock('2026-10-06T01:00:00Z', 'America/New_York', 'en-IN')).toMatch(/Tue.*6:30\s?AM/);
    expect(viewerClock('', 'Europe/London')).toBe('');
    expect(viewerClock('2026-10-05T08:00:00Z', 'bad/zone')).toBe('');
  });

  it('formats instants in a given zone', () => {
    expect(formatInstant('2026-10-04T04:30:00Z', 'en-IN', 'Asia/Kolkata')).toMatch(/4 Oct 2026.*10:00.*(IST|GMT\+5:30)/);
    expect(formatInstant('', 'en-IN')).toBe('');
  });
});

describe('formatStamp', () => {
  it('reads server timestamps without an offset as UTC', () => {
    // 10:00 UTC is 15:30 in India (the test viewer's zone)
    expect(formatStamp('2026-10-05T10:00:00.123', 'en-IN')).toMatch(/5 Oct 2026.*3:30/);
    expect(formatStamp('2026-10-05T10:00:00Z', 'en-IN')).toMatch(/3:30/);
    expect(formatStamp('2026-10-05', 'en-IN')).toMatch(/5 Oct 2026/);
    expect(formatStamp('', 'en-IN')).toBe('');
  });
});
