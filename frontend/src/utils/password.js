// FR-8: password policy shared by sign-up and change-password.
export const PASSWORD_MIN_LENGTH = 8;

// Order matters: it is the order the checklist is shown in.
export const PASSWORD_RULES = ['length', 'lower', 'upper', 'number'];

/**
 * checkPassword('Secret123') ->
 *   { valid: true, checks: { length, lower, upper, number }, score: 4, level: 'good' }
 * `score` counts satisfied checks (0-4); `level` is '', 'weak', 'fair', 'good' or 'strong'.
 */
export function checkPassword(pw) {
  const s = typeof pw === 'string' ? pw : '';
  const checks = {
    length: s.length >= PASSWORD_MIN_LENGTH,
    lower: /[a-z]/.test(s),
    upper: /[A-Z]/.test(s),
    number: /[0-9]/.test(s)
  };
  const score = PASSWORD_RULES.filter((k) => checks[k]).length;
  const valid = score === PASSWORD_RULES.length;
  let level = '';
  if (s) {
    if (!valid) level = score >= 3 ? 'fair' : 'weak';
    else level = s.length >= 12 || /[^A-Za-z0-9]/.test(s) ? 'strong' : 'good';
  }
  return { valid, checks, score, level };
}
