import { describe, expect, it } from 'vitest';
import { checkPassword, PASSWORD_RULES } from './password';

describe('checkPassword', () => {
  it('reports every rule for an empty password', () => {
    expect(checkPassword('')).toEqual({
      valid: false,
      checks: { length: false, lower: false, upper: false, number: false },
      score: 0,
      level: ''
    });
  });

  it('checks length >= 8, lowercase, uppercase and a number independently', () => {
    expect(checkPassword('abc').checks).toEqual({ length: false, lower: true, upper: false, number: false });
    expect(checkPassword('ABC123').checks).toEqual({ length: false, lower: false, upper: true, number: true });
    expect(checkPassword('abcdefgh').checks).toEqual({ length: true, lower: true, upper: false, number: false });
    expect(checkPassword('1234567').checks.length).toBe(false);
    expect(checkPassword('12345678').checks.length).toBe(true);
  });

  it('is valid only when all four rules pass', () => {
    expect(checkPassword('Abcdefg1').valid).toBe(true);
    expect(checkPassword('abcdefg1').valid).toBe(false); // no uppercase
    expect(checkPassword('ABCDEFG1').valid).toBe(false); // no lowercase
    expect(checkPassword('Abcdefgh').valid).toBe(false); // no number
    expect(checkPassword('Abcde1').valid).toBe(false); // too short
  });

  it('accepts the seeded demo passwords', () => {
    ['Customer@123', 'Admin@123', 'Provider@123'].forEach((pw) => expect(checkPassword(pw).valid).toBe(true));
  });

  it('scores satisfied rules and derives a strength level', () => {
    expect(checkPassword('a')).toMatchObject({ score: 1, level: 'weak' });
    expect(checkPassword('abcdefgh')).toMatchObject({ score: 2, level: 'weak' });
    expect(checkPassword('Abcdefgh')).toMatchObject({ score: 3, level: 'fair' });
    expect(checkPassword('Abcdefg1')).toMatchObject({ score: 4, level: 'good' });
    expect(checkPassword('Abcdefg1!')).toMatchObject({ score: 4, level: 'strong' });
    expect(checkPassword('Abcdefgh1234')).toMatchObject({ score: 4, level: 'strong' });
  });

  it('never throws on non-string input', () => {
    [undefined, null, 12345678, {}].forEach((value) => {
      expect(checkPassword(value)).toMatchObject({ valid: false, score: 0, level: '' });
    });
  });

  it('exposes the rule order used by the checklist', () => {
    expect(PASSWORD_RULES).toEqual(['length', 'lower', 'upper', 'number']);
  });
});
