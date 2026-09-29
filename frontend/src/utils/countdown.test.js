import { describe, expect, it } from 'vitest';
import { formatCountdown, localDeadline, minutesLeft, msUntil } from './countdown';
import { tp } from './plural';

describe('countdown helpers', () => {
  it("measures the remaining time against the server's clock", () => {
    const now = Date.parse('2026-10-05T10:00:00Z');
    // Server says it is 10:00:30 and the hold expires at 10:10:30: 10 minutes left whatever our clock
    // says, minus a second for the truncated header and the transfer time.
    expect(localDeadline('2026-10-05T10:10:30Z', 'Mon, 05 Oct 2026 10:00:30 GMT', now)).toBe(now + 10 * 60000 - 1000);
    // Without a Date header the expiry is taken as is.
    expect(localDeadline('2026-10-05T10:10:00Z', undefined, now)).toBe(Date.parse('2026-10-05T10:10:00Z'));
    expect(localDeadline('not a date', undefined, now)).toBeNull();
  });

  it('never goes below zero', () => {
    expect(msUntil(1000, 400)).toBe(600);
    expect(msUntil(1000, 5000)).toBe(0);
    expect(msUntil(null, 5000)).toBe(0);
  });

  it('shows mm:ss rounded up and whole minutes for screen readers', () => {
    expect(formatCountdown(10 * 60000)).toBe('10:00');
    expect(formatCountdown(65_001)).toBe('01:06');
    expect(formatCountdown(0)).toBe('00:00');
    expect(minutesLeft(10 * 60000)).toBe(10);
    expect(minutesLeft(9 * 60000 + 1)).toBe(10);
    expect(minutesLeft(59_000)).toBe(1);
    expect(minutesLeft(0)).toBe(0);
  });
});

describe('tp (plural)', () => {
  const dict = { 'x.items': '{count} items', 'x.items_one': 'one item', 'x.only': '{count} things' };
  const t = (key, vars) => (dict[key] ? dict[key].replace('{count}', vars?.count) : key);

  it('uses the _one form for a count of 1 when it exists', () => {
    expect(tp(t, 'x.items', { count: 1 })).toBe('one item');
    expect(tp(t, 'x.items', { count: 3 })).toBe('3 items');
    expect(tp(t, 'x.only', { count: 1 })).toBe('1 things');
  });
});
