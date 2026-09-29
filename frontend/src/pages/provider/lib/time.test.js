import { describe, expect, it } from 'vitest';
import { fromMinutes, isoDayOfWeek, minutesNowInZone, mondayOf, toMinutes, todayInZone, weekDates, weekdayName } from './time';
import { binDays, columnPath, hourRange, labelStride, maxIndex, niceTicks } from './chart';

describe('provider-local dates', () => {
  // 29 Sep 2026 20:30 UTC = 30 Sep 02:00 in India, still 29 Sep in London and New York
  const instant = new Date(Date.UTC(2026, 8, 29, 20, 30));

  it('computes "today" in the provider\'s zone, not the browser\'s', () => {
    expect(todayInZone('Asia/Kolkata', instant)).toBe('2026-09-30');
    expect(todayInZone('Europe/London', instant)).toBe('2026-09-29');
    expect(todayInZone('America/New_York', instant)).toBe('2026-09-29');
  });

  it('reads the wall clock of the zone', () => {
    expect(minutesNowInZone('Asia/Kolkata', instant)).toBe(2 * 60);
    expect(minutesNowInZone('Europe/London', instant)).toBe(21 * 60 + 30);
  });

  it('falls back to the browser zone for unknown zones', () => {
    expect(todayInZone('Not/AZone', instant)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('weeks', () => {
  it('uses ISO weekdays (Monday = 1) and Monday-based weeks', () => {
    expect(isoDayOfWeek('2026-09-28')).toBe(1);
    expect(isoDayOfWeek('2026-10-04')).toBe(7);
    expect(mondayOf('2026-10-04')).toBe('2026-09-28');
    expect(mondayOf('2026-09-28')).toBe('2026-09-28');
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
    expect(weekDates('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('names weekdays by ISO number', () => {
    expect(weekdayName(1, 'en-GB')).toBe('Monday');
    expect(weekdayName(7, 'en-GB')).toBe('Sunday');
  });

  it('converts times to minutes and back', () => {
    expect(toMinutes('09:30:00')).toBe(570);
    expect(toMinutes('bad')).toBeNaN();
    expect(fromMinutes(570)).toBe('09:30');
    expect(fromMinutes(1440)).toBe('24:00');
  });
});

describe('chart helpers', () => {
  it('makes clean integer ticks', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(95)).toEqual([0, 50, 100]);
  });

  it('thins x labels so they never collide', () => {
    expect(labelStride(7, 100)).toBe(1);
    expect(labelStride(60, 12)).toBe(7);
    expect(labelStride(365, 2)).toBe(30);
  });

  it('draws columns with a rounded top and a square base', () => {
    expect(columnPath(10, 20, 20, 50, 4)).toBe('M10,70V24Q10,20 14,20H26Q30,20 30,24V70Z');
    expect(columnPath(0, 0, 0, 10)).toBe('');
  });

  it('finds the peak', () => {
    expect(maxIndex([0, 3, 1, 3])).toBe(1);
    expect(maxIndex([0, 0])).toBe(-1);
  });

  it('turns sparse byHour rows into a continuous, padded range', () => {
    expect(hourRange([{ hour: 10, bookings: 2 }, { hour: 13, bookings: 1 }])).toEqual([
      { hour: 9, bookings: 0 }, { hour: 10, bookings: 2 }, { hour: 11, bookings: 0 },
      { hour: 12, bookings: 0 }, { hour: 13, bookings: 1 }, { hour: 14, bookings: 0 }
    ]);
    expect(hourRange([])).toEqual([]);
  });

  it('keeps short ranges daily and sums long ones per week', () => {
    const days = Array.from({ length: 100 }, (_, i) => {
      const d = new Date(2026, 0, 5 + i); // 5 Jan 2026 is a Monday
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: iso, bookings: 1, cancellations: i % 7 === 0 ? 1 : 0, revenue: 100 };
    });
    expect(binDays(days.slice(0, 30), mondayOf).unit).toBe('day');
    const { unit, bins } = binDays(days, mondayOf);
    expect(unit).toBe('week');
    expect(bins).toHaveLength(15);
    expect(bins[0]).toEqual({ key: '2026-01-05', date: '2026-01-05', bookings: 7, cancellations: 1, revenue: 700 });
    expect(bins[14].bookings).toBe(2); // 100 days = 14 full weeks + 2 days
  });
});
