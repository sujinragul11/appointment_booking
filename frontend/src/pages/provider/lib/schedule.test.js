import { describe, expect, it } from 'vitest';
import { canCollect, endMinutes, gridHours, groupByDate, layoutDay, withPayment } from './schedule';

const appt = (id, startTime, endTime, extra = {}) => ({ id, startTime, endTime, date: '2026-10-01', ...extra });

describe('gridHours (week grid time rows)', () => {
  it('spans the earliest to the latest working window, rounded out to whole hours', () => {
    const windows = [
      { dayOfWeek: 1, startTime: '09:30:00', endTime: '13:00:00', active: true },
      { dayOfWeek: 1, startTime: '14:00:00', endTime: '18:15:00', active: true },
      { dayOfWeek: 2, startTime: '08:00:00', endTime: '12:00:00', active: false } // inactive: ignored
    ];
    expect(gridHours(windows, [])).toEqual({ startHour: 9, endHour: 19 });
  });

  it('grows to include appointments outside the working hours', () => {
    const windows = [{ startTime: '09:00', endTime: '17:00' }];
    expect(gridHours(windows, [appt(1, '07:30:00', '08:00:00'), appt(2, '19:00:00', '20:30:00')]))
      .toEqual({ startHour: 7, endHour: 21 });
  });

  it('falls back to 8-20 when nothing is known, and handles end-of-day windows', () => {
    expect(gridHours([], [])).toEqual({ startHour: 8, endHour: 20 });
    expect(gridHours([{ startTime: '18:00', endTime: '00:00' }], [])).toEqual({ startHour: 18, endHour: 24 });
  });
});

describe('layoutDay (appointment blocks)', () => {
  it('keeps separate appointments in a single full-width lane', () => {
    const laid = layoutDay([appt(1, '09:00', '09:30'), appt(2, '10:00', '10:30')], { startHour: 8, endHour: 18 });
    expect(laid.map(({ item, lane, lanes, start, end }) => [item.id, lane, lanes, start, end]))
      .toEqual([[1, 0, 1, 540, 570], [2, 0, 1, 600, 630]]);
  });

  it('puts overlapping appointments side by side and reuses freed lanes', () => {
    const laid = layoutDay([
      appt('a', '09:00', '10:00'),
      appt('b', '09:30', '10:30'),
      appt('c', '10:00', '11:00'), // overlaps b only: can take a's lane
      appt('d', '12:00', '12:30') // separate cluster
    ], { startHour: 8, endHour: 18 });
    const byId = Object.fromEntries(laid.map((l) => [l.item.id, l]));
    expect([byId.a.lane, byId.b.lane, byId.c.lane]).toEqual([0, 1, 0]);
    expect([byId.a.lanes, byId.b.lanes, byId.c.lanes]).toEqual([2, 2, 2]);
    expect([byId.d.lane, byId.d.lanes]).toEqual([0, 1]);
  });

  it('gives short appointments a minimum height, which counts as overlap', () => {
    const laid = layoutDay([appt(1, '09:00', '09:05'), appt(2, '09:10', '09:20')], { startHour: 8, endHour: 18, minMinutes: 20 });
    expect(laid[0].end - laid[0].start).toBe(20);
    expect(laid.map((l) => l.lanes)).toEqual([2, 2]);
  });

  it('clips blocks to the visible hours and skips malformed rows', () => {
    const laid = layoutDay([appt(1, '06:00', '09:00'), appt(2, 'x', 'y'), appt(3, '17:50', '19:00')], { startHour: 8, endHour: 18, minMinutes: 20 });
    expect(laid.map((l) => [l.item.id, l.start, l.end])).toEqual([[1, 480, 540], [3, 1060, 1080]]);
  });

  it('treats an end at or before the start as running to midnight', () => {
    expect(endMinutes(appt(1, '23:00', '00:00'))).toBe(1440);
  });
});

describe('groupByDate', () => {
  it('groups by date and sorts each day by start time', () => {
    const grouped = groupByDate([
      { id: 1, date: '2026-10-02', startTime: '11:00' },
      { id: 2, date: '2026-10-01', startTime: '15:00' },
      { id: 3, date: '2026-10-01', startTime: '09:00' }
    ]);
    expect(Object.keys(grouped).sort()).toEqual(['2026-10-01', '2026-10-02']);
    expect(grouped['2026-10-01'].map((a) => a.id)).toEqual([3, 2]);
  });
});

describe('payment collection', () => {
  it('is offered only while money is due on a booking that is not cancelled', () => {
    expect(canCollect({ status: 'CONFIRMED', payment: { balanceDue: 300 } })).toBe(true);
    expect(canCollect({ status: 'COMPLETED', payment: { balanceDue: 50 } })).toBe(true);
    expect(canCollect({ status: 'CANCELLED', payment: { balanceDue: 300 } })).toBe(false);
    expect(canCollect({ status: 'CONFIRMED', payment: { balanceDue: 0 } })).toBe(false);
    expect(canCollect({ status: 'CONFIRMED' })).toBe(false);
  });

  it('merges the payment returned by /collect into the appointment', () => {
    const a = { id: 1, paymentStatus: 'PENDING', payment: { balanceDue: 300, status: 'PENDING' } };
    expect(withPayment(a, { balanceDue: 0, status: 'SUCCESS', amount: 300 }))
      .toEqual({ id: 1, paymentStatus: 'SUCCESS', payment: { balanceDue: 0, status: 'SUCCESS', amount: 300 } });
  });
});
