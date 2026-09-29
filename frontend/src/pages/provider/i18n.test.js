import { describe, expect, it } from 'vitest';
import en from '../../i18n/areas/provider.en';
import hi from '../../i18n/areas/provider.hi';
import ta from '../../i18n/areas/provider.ta';
import { translate } from '../../i18n';

const keysOf = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  (v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();

describe('provider area translations', () => {
  const english = keysOf(en).sort();

  it('Hindi and Tamil define every English key', () => {
    expect(keysOf(hi).sort()).toEqual(english);
    expect(keysOf(ta).sort()).toEqual(english);
  });

  it('keep the same {placeholders} and are not left in English', () => {
    english.forEach((key) => {
      const source = translate('en', key);
      expect(placeholders(translate('hi', key)), key).toBe(placeholders(source));
      expect(placeholders(translate('ta', key)), key).toBe(placeholders(source));
    });
    // spot checks that the area files are merged into the app dictionaries
    expect(translate('hi', 'provider.nav.schedule')).not.toBe(translate('en', 'provider.nav.schedule'));
    expect(translate('ta', 'provider.nav.schedule')).not.toBe(translate('en', 'provider.nav.schedule'));
  });
});
