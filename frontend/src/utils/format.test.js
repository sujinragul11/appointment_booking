import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDaysISO, addMonthsISO, formatInZone, formatViewerTime, nextDays, parseISODate, timeZoneLabel,
  toLocalISODate, todayISO, zonedTimeToDate
} from './format';

// Run in UTC+5:30: between 00:00 and 05:30 local time, UTC is still "yesterday", which is
// exactly when the old toISOString().slice(0, 10) produced the wrong calendar date.
process.env.TZ = 'Asia/Kolkata';

afterEach(() => {
  vi.useRealTimers();
});

describe('local calendar dates', () => {
  it('runs these tests in a UTC+ zone', () => {
    expect(new Date(2026, 0, 5, 0, 30).getTimezoneOffset()).toBe(-330);
  });

  it('formats the local date, not the UTC one', () => {
    const justAfterMidnight = new Date(2026, 0, 5, 0, 30);
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-01-04'); // the old bug
    expect(toLocalISODate(justAfterMidnight)).toBe('2026-01-05');
  });

  it('zero-pads month and day', () => {
    expect(toLocalISODate(new Date(2026, 2, 7))).toBe('2026-03-07');
    expect(toLocalISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('todayISO uses the local date', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 5, 1, 0));
    expect(todayISO()).toBe('2026-01-05');
  });

  it('parses yyyy-mm-dd as local midnight and rejects invalid dates', () => {
    const d = parseISODate('2026-10-15');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 15, 0]);
    expect(parseISODate('2026-02-30')).toBeNull();
    expect(parseISODate('15/10/2026')).toBeNull();
    expect(parseISODate('')).toBeNull();
  });

  it('adds days and months across boundaries', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-03-15', -3)).toBe('2025-12-15');
  });
});

describe('nextDays', () => {
  it('starts tomorrow by default and uses local dates', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 5, 0, 30)); // Monday 5 Jan, 00:30 local (still 4 Jan in UTC)
    const days = nextDays(2);
    expect(days.map((d) => d.iso)).toEqual(['2026-01-06', '2026-01-07']);
    expect(days.every((d) => d.isToday === false)).toBe(true);
  });

  it('can include today and describes each day', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 5, 0, 30));
    const days = nextDays(3, 0);
    expect(days).toEqual([
      { iso: '2026-01-05', dow: 'Mon', day: 5, month: 'Jan', isToday: true },
      { iso: '2026-01-06', dow: 'Tue', day: 6, month: 'Jan', isToday: false },
      { iso: '2026-01-07', dow: 'Wed', day: 7, month: 'Jan', isToday: false }
    ]);
  });

  it('rolls over month and year ends', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 11, 31, 23, 45));
    expect(nextDays(2, 0).map((d) => d.iso)).toEqual(['2026-12-31', '2027-01-01']);
  });
});

describe('time zones', () => {
  it('converts a wall-clock time in a zone to the right instant', () => {
    expect(zonedTimeToDate('2026-10-05', '10:30:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-05T05:00:00.000Z');
    expect(zonedTimeToDate('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z'); // EDT
    expect(zonedTimeToDate('2026-01-15', '09:00', 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z'); // EST
  });

  it('formats in the provider zone with its label', () => {
    const text = formatInZone('2026-10-05', '10:30:00', 'Asia/Kolkata');
    expect(text).toContain('5 Oct 2026');
    expect(text).toContain('10:30');
    expect(text).toMatch(/IST|GMT\+5:30/);
    expect(formatInZone('2026-10-05', '10:30:00', 'America/New_York')).toMatch(/10:30.*(EDT|GMT-4)/);
  });

  it('falls back to plain formatting without a valid zone', () => {
    expect(formatInZone('2026-10-05', '10:30:00')).toBe('5 Oct 2026, 10:30 AM');
    expect(formatInZone('2026-10-05', '10:30:00', 'Not/AZone')).toBe('5 Oct 2026, 10:30 AM');
    expect(formatInZone('', '10:30')).toBe('-');
  });

  it('labels zones and shows the viewer-local time only when zones differ', () => {
    expect(timeZoneLabel('Asia/Kolkata')).toMatch(/IST|GMT\+5:30/);
    expect(timeZoneLabel('')).toBe('');
    expect(formatViewerTime('2026-10-05', '10:30:00', 'Asia/Kolkata')).toBe(''); // viewer is in IST too
    expect(formatViewerTime('2026-10-05', '09:00:00', 'Europe/London')).toMatch(/1:30/); // 09:00 BST = 13:30 IST
  });
});
