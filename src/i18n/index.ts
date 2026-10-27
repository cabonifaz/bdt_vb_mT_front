import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './es.json';
import en from './en.json';

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = 'bdt.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch { /* almacenamiento no disponible */ }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: initialLocale(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false }, // React ya escapa
});

document.documentElement.lang = i18n.language;

export function setLocale(l: Locale) {
  i18n.changeLanguage(l);
  document.documentElement.lang = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignorar */ }
}

/** Textos personalizados por tenant (sobrescriben la traducción base). */
export function applyTenantOverrides(locale: Locale, overrides: Record<string, string>) {
  const nested: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(overrides)) {
    const parts = k.split('.');
    let cur = nested as Record<string, unknown>;
    parts.slice(0, -1).forEach((p) => { cur = (cur[p] ??= {}) as Record<string, unknown>; });
    cur[parts[parts.length - 1]] = v;
  }
  i18n.addResourceBundle(locale, 'translation', nested, true, true);
}

export default i18n;
