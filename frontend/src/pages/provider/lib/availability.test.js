import { describe, expect, it } from 'vitest';
import {
  blockKind, blockPayload, copyMondayToWeekdays, emptyWeek, suggestWindow, validateBlock, validateWeek, weekFromWindows,
  weekSignature, weekToPayload
} from './availability';

const w = (key, start, end) => ({ key, start, end });

describe('weekFromWindows', () => {
  const windows = [
    { id: 1, dayOfWeek: 1, startTime: '14:00:00', endTime: '18:00:00', active: true },
    { id: 2, dayOfWeek: 1, startTime: '09:00:00', endTime: '13:00:00', active: true },
    { id: 3, staffId: 7, dayOfWeek: 1, startTime: '09:00:00', endTime: '12:00:00', active: true },
    { id: 4, dayOfWeek: 2, startTime: '09:00:00', endTime: '12:00:00', active: false }
  ];

  it('takes the business windows (staffId null), sorted, as HH:mm', () => {
    const week = weekFromWindows(windows, null);
    expect(week[1].map((x) => [x.start, x.end])).toEqual([['09:00', '13:00'], ['14:00', '18:00']]);
    expect(week[2]).toEqual([]); // inactive window dropped
    expect(Object.keys(week)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('takes only one staff member\'s windows', () => {
    expect(weekFromWindows(windows, 7)[1].map((x) => [x.start, x.end])).toEqual([['09:00', '12:00']]);
  });
});

describe('validateWeek', () => {
  it('accepts several non-overlapping windows per day (lunch break)', () => {
    const week = { ...emptyWeek(), 1: [w('a', '09:00', '13:00'), w('b', '14:00', '18:00')], 3: [w('c', '10:00', '12:00')] };
    expect(validateWeek(week)).toEqual({});
  });

  it('accepts windows that touch end-to-start', () => {
    expect(validateWeek({ ...emptyWeek(), 1: [w('a', '09:00', '12:00'), w('b', '12:00', '15:00')] })).toEqual({});
  });

  it('rejects a start that is not before the end', () => {
    expect(validateWeek({ ...emptyWeek(), 2: [w('a', '13:00', '09:00'), w('b', '10:00', '10:00')] }))
      .toEqual({ a: 'order', b: 'order' });
  });

  it('reports overlaps on the later window, also when it is nested in an earlier long one', () => {
    const week = { ...emptyWeek(), 4: [w('long', '09:00', '17:00'), w('short', '10:00', '11:00'), w('later', '12:00', '13:00')] };
    expect(validateWeek(week)).toEqual({ short: 'overlap', later: 'overlap' });
  });

  it('does not treat windows on different days as overlapping', () => {
    expect(validateWeek({ ...emptyWeek(), 1: [w('a', '09:00', '17:00')], 2: [w('b', '09:00', '17:00')] })).toEqual({});
  });

  it('requires both times', () => {
    expect(validateWeek({ ...emptyWeek(), 5: [w('a', '', '12:00'), w('b', '09:00', '9')] })).toEqual({ a: 'required', b: 'required' });
  });
});

describe('copyMondayToWeekdays', () => {
  it('copies Monday to Tuesday-Friday with fresh keys and leaves the weekend alone', () => {
    const week = { ...emptyWeek(), 1: [w('a', '09:00', '13:00'), w('b', '14:00', '18:00')], 2: [w('x', '07:00', '08:00')], 6: [w('s', '10:00', '14:00')] };
    const next = copyMondayToWeekdays(week);
    [2, 3, 4, 5].forEach((d) => expect(next[d].map((x) => [x.start, x.end])).toEqual([['09:00', '13:00'], ['14:00', '18:00']]));
    expect(next[6]).toBe(week[6]);
    expect(next[7]).toEqual([]);
    const keys = [1, 2, 3, 4, 5].flatMap((d) => next[d].map((x) => x.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(week[2].map((x) => x.key)).toEqual(['x']); // input not mutated
  });
});

describe('weekToPayload / weekSignature', () => {
  it('builds the PUT /availability/week windows sorted by day and time', () => {
    const week = { ...emptyWeek(), 3: [w('c', '14:00', '18:00'), w('b', '09:00', '13:00')], 1: [w('a', '10:00', '11:00')] };
    expect(weekToPayload(week)).toEqual([
      { dayOfWeek: 1, startTime: '10:00', endTime: '11:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 3, startTime: '14:00', endTime: '18:00' }
    ]);
  });

  it('ignores keys and order for change detection', () => {
    const a = { ...emptyWeek(), 1: [w('a', '09:00', '13:00'), w('b', '14:00', '18:00')] };
    const b = { ...emptyWeek(), 1: [w('y', '14:00', '18:00'), w('z', '09:00', '13:00')] };
    expect(weekSignature(a)).toBe(weekSignature(b));
    expect(weekSignature(a)).not.toBe(weekSignature(emptyWeek()));
  });
});

describe('suggestWindow', () => {
  it('suggests the afternoon after a morning window, else a default day', () => {
    expect(suggestWindow([w('a', '09:00', '13:00')])).toMatchObject({ start: '14:00', end: '18:00' });
    expect(suggestWindow([])).toMatchObject({ start: '09:00', end: '17:00' });
    expect(suggestWindow([w('a', '09:00', '22:30')])).toMatchObject({ start: '09:00', end: '17:00' });
  });
});

describe('blocked dates', () => {
  it('classifies entries', () => {
    expect(blockKind({ available: false })).toBe('closed');
    expect(blockKind({ available: false, startTime: '12:00:00', endTime: '14:00:00' })).toBe('partial');
    expect(blockKind({ available: true, startTime: '10:00:00', endTime: '14:00:00' })).toBe('custom');
  });

  it('builds the POST /availability/blocked payload for each kind', () => {
    const base = { date: '2026-10-20', staffId: '', startTime: '10:00', endTime: '12:00', reason: '  Diwali ' };
    expect(blockPayload({ ...base, kind: 'closed' }))
      .toEqual({ date: '2026-10-20', staffId: null, startTime: null, endTime: null, available: false, reason: 'Diwali' });
    expect(blockPayload({ ...base, kind: 'partial', staffId: '7', reason: '' }))
      .toEqual({ date: '2026-10-20', staffId: 7, startTime: '10:00', endTime: '12:00', available: false, reason: null });
    expect(blockPayload({ ...base, kind: 'custom' }))
      .toMatchObject({ startTime: '10:00', endTime: '12:00', available: true });
  });

  it('validates the date (not in the past) and the time range', () => {
    const today = '2026-09-29';
    expect(validateBlock({ date: '', kind: 'closed' }, today)).toEqual({ date: 'required' });
    expect(validateBlock({ date: '2026-09-28', kind: 'closed' }, today)).toEqual({ date: 'past' });
    expect(validateBlock({ date: today, kind: 'closed' }, today)).toEqual({});
    expect(validateBlock({ date: today, kind: 'partial', startTime: '14:00', endTime: '12:00' }, today)).toEqual({ time: 'order' });
    expect(validateBlock({ date: today, kind: 'custom', startTime: '', endTime: '12:00' }, today)).toEqual({ time: 'required' });
  });
});
