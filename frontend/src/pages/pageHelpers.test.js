import { describe, expect, it } from 'vitest';
import { bookingTab } from './dashboard/CustomerDashboard';
import { normalizeStats } from './provider/ProviderAppointments';

describe('bookingTab (FR-27)', () => {
  const today = '2026-10-15';
  const appt = (status, date) => ({ status, date });

  it('puts active bookings from today on in Upcoming', () => {
    ['PENDING', 'CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'].forEach((s) => {
      expect(bookingTab(appt(s, today), today)).toBe('upcoming');
      expect(bookingTab(appt(s, '2026-11-01'), today)).toBe('upcoming');
    });
  });

  it('puts finished bookings and anything dated before today in Past', () => {
    expect(bookingTab(appt('COMPLETED', '2026-11-01'), today)).toBe('past');
    expect(bookingTab(appt('NO_SHOW', today), today)).toBe('past');
    expect(bookingTab(appt('CONFIRMED', '2026-10-14'), today)).toBe('past');
    expect(bookingTab(appt('PENDING', '2025-12-31'), today)).toBe('past');
  });

  it('puts cancelled bookings in Cancelled whatever the date', () => {
    expect(bookingTab(appt('CANCELLED', '2026-10-14'), today)).toBe('cancelled');
    expect(bookingTab(appt('CANCELLED', '2026-11-01'), today)).toBe('cancelled');
  });
});

describe('normalizeStats', () => {
  it('reads the backend field names', () => {
    expect(normalizeStats({ todayAppointments: 2, upcomingAppointments: 5, completedAppointments: 9, cancelledAppointments: 1 }))
      .toEqual({ today: 2, upcoming: 5, completed: 9, cancelled: 1 });
  });

  it('still accepts the old short names and defaults to 0', () => {
    expect(normalizeStats({ today: 3, upcoming: 4 })).toEqual({ today: 3, upcoming: 4, completed: 0, cancelled: 0 });
    expect(normalizeStats(undefined)).toEqual({ today: 0, upcoming: 0, completed: 0, cancelled: 0 });
    expect(normalizeStats(null)).toEqual({ today: 0, upcoming: 0, completed: 0, cancelled: 0 });
  });
});
