import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, LANG_STORAGE_KEY, translate, useI18n, useT } from './index';
import en from './en';
import hi from './hi';
import ta from './ta';

const keysOf = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  (v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('dictionaries', () => {
  it('Hindi and Tamil define every English key', () => {
    const english = keysOf(en).sort();
    expect(keysOf(hi).sort()).toEqual(english);
    expect(keysOf(ta).sort()).toEqual(english);
  });

  it('keep the same {placeholders} as English', () => {
    const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    keysOf(en).forEach((key) => {
      expect(placeholders(translate('hi', key)), key).toBe(placeholders(translate('en', key)));
      expect(placeholders(translate('ta', key)), key).toBe(placeholders(translate('en', key)));
    });
  });
});

describe('translate', () => {
  it('looks up dot paths and fills {placeholders}', () => {
    expect(translate('en', 'nav.browse')).toBe('Browse');
    expect(translate('hi', 'nav.browse')).toBe('ब्राउज़ करें');
    expect(translate('ta', 'footer.rights', { year: 2026 })).toContain('2026');
    expect(translate('en', 'nav.notificationsUnread', { count: 3 })).toBe('Notifications, 3 unread');
  });

  it('falls back to English, then to the key', () => {
    expect(translate('xx', 'nav.browse')).toBe('Browse');
    expect(translate('hi', 'no.such.key')).toBe('no.such.key');
  });
});

function Probe() {
  const { lang, setLang } = useI18n();
  const t = useT();
  return (
    <div>
      <p>{t('nav.signIn')}</p>
      <button type="button" onClick={() => setLang(lang === 'en' ? 'ta' : 'en')}>switch</button>
    </div>
  );
}

describe('I18nProvider', () => {
  it('switches language, persists the choice and sets <html lang>', async () => {
    const user = userEvent.setup();
    render(<I18nProvider initialLanguage="en"><Probe /></I18nProvider>);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    await user.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.getByText('உள்நுழை')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ta');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('ta');
  });

  it('restores the saved language', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByText('साइन इन करें')).toBeInTheDocument();
  });

  it('works without a provider (English)', () => {
    render(<Probe />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });
});
