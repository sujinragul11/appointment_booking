/**
 * Count-dependent translation: uses "<key>_one" when vars.count is 1 and the dictionary has
 * that key, otherwise "<key>". Example: tp(t, 'site.rating.reviews', { count: 1 }) -> "1 review".
 */
export function tp(t, key, vars = {}) {
  if (Number(vars.count) === 1) {
    const one = t(`${key}_one`, vars);
    if (one !== `${key}_one`) return one;
  }
  return t(key, vars);
}
