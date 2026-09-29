import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en';
import hi from './hi';
import ta from './ta';

// NFR-9: lightweight i18n. Keys are dot paths into the dictionaries ("nav.browse");
// missing keys fall back to English, then to the key itself.
export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-IN' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi-IN' },
  { code: 'ta', label: 'தமிழ்', locale: 'ta-IN' }
];

// Feature areas add their strings in i18n/areas/<area>.<lang>.js (default export: a nested
// object, e.g. { admin: { users: { title: 'Users' } } }); they are merged into the base dictionary.
function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const DICTIONARIES = { en: deepMerge({}, en), hi: deepMerge({}, hi), ta: deepMerge({}, ta) };
const AREA_MODULES = import.meta.glob('./areas/*.js', { eager: true });
for (const [path, mod] of Object.entries(AREA_MODULES)) {
  const match = path.match(/\/[\w-]+\.(\w+)\.js$/);
  if (match && DICTIONARIES[match[1]]) deepMerge(DICTIONARIES[match[1]], mod.default);
}
export const DEFAULT_LANG = 'en';
export const LANG_STORAGE_KEY = 'lang';

function lookup(dict, key) {
  return String(key)
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
}

/** translate('hi', 'footer.rights', { year: 2026 }); "{name}" placeholders are filled from vars. */
export function translate(lang, key, vars) {
  let text = lookup(DICTIONARIES[lang], key);
  if (typeof text !== 'string') text = lookup(en, key);
  if (typeof text !== 'string') return key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] == null ? match : String(vars[name])));
}

export function localeFor(lang) {
  return (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).locale;
}

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && DICTIONARIES[saved]) return saved;
  } catch {
    // storage unavailable (private mode): fall through
  }
  const browser = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : '').slice(0, 2).toLowerCase();
  return DICTIONARIES[browser] ? browser : DEFAULT_LANG;
}

const I18nContext = createContext(null);

export function I18nProvider({ children, initialLanguage }) {
  const [lang, setLangState] = useState(() => (DICTIONARIES[initialLanguage] ? initialLanguage : initialLang()));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!DICTIONARIES[code]) return;
    setLangState(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // not persisted, still switches for this visit
    }
  }, []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t, locale: localeFor(lang), languages: LANGUAGES }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Components also work outside the provider (e.g. in unit tests): English, no switching.
const FALLBACK = {
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, vars) => translate(DEFAULT_LANG, key, vars),
  locale: localeFor(DEFAULT_LANG),
  languages: LANGUAGES
};

export function useI18n() {
  return useContext(I18nContext) || FALLBACK;
}

export function useT() {
  return useI18n().t;
}
