import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_URL, http } from '../lib/api';
import { offlineCache } from '../lib/offline';
import { applyTenantOverrides, type Locale } from '../i18n';
import i18n from '../i18n';

export interface Branding {
  tenantId: string;
  slug: string;
  name: string;
  defaultLocale: string;
  displayName: string;
  logoUrl: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  colorPrimary: string;
  colorPrimaryHover: string;
  colorSecondary: string;
  colorAccent: string;
  colorSidebar: string;
  fontFamily: string;
  version: string;
  // plantilla del CV con la marca del tenant
  cvHeaderUrl?: string;
  cvFooterUrl?: string;
  cvFooterText?: string;
  cvShowPhoto?: boolean;
}

export const ALLOWED_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Lato', 'Nunito', 'Source Sans 3'];

/** Resuelve URLs de recursos del backend (logos subidos) o estáticos del front (seed). */
export function assetUrl(u?: string) {
  if (!u) return '';
  return u.startsWith('/api/') ? `${API_URL}${u}` : u;
}

export function applyBranding(b: Pick<Branding, 'colorPrimary' | 'colorPrimaryHover' | 'colorSecondary' | 'colorAccent' | 'colorSidebar' | 'fontFamily'>) {
  const root = document.documentElement.style;
  root.setProperty('--brand-primary', b.colorPrimary);
  root.setProperty('--brand-primary-hover', b.colorPrimaryHover);
  root.setProperty('--brand-secondary', b.colorSecondary);
  root.setProperty('--brand-accent', b.colorAccent);
  root.setProperty('--brand-sidebar', b.colorSidebar);
  if (ALLOWED_FONTS.includes(b.fontFamily)) {
    root.setProperty('--brand-font', `'${b.fontFamily}'`);
    const id = 'tenant-font';
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(b.fontFamily)}:wght@400;500;600;700&display=swap`;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }
}

function applyMeta(b: Branding) {
  document.title = b.displayName;
  const fav = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (fav) fav.href = b.faviconUrl ? assetUrl(b.faviconUrl) : assetUrl(b.logoUrl);
}

type BrandLite = Pick<Branding, 'slug' | 'displayName' | 'logoUrl' | 'colorPrimary' | 'colorSecondary'>;
const brandKey = (slug: string) => `bdt:brand:${slug}`;

/**
 * Último branding conocido del tenant de la URL, leído de forma síncrona (localStorage) para que
 * las pantallas de carga muestren su logo desde el primer instante. Solo datos públicos de marca.
 */
export function lastBrand(): BrandLite | null {
  const slug = window.location.pathname.split('/')[1];
  if (!slug || slug === 'admin') return null;
  try {
    const raw = localStorage.getItem(brandKey(slug));
    return raw ? (JSON.parse(raw) as BrandLite) : null;
  } catch { return null; }
}

interface ThemeCtx {
  branding: Branding | null;
  error: string | null;
  load: (slug: string) => Promise<void>;
  setBranding: (b: Branding) => void;
}

const Ctx = createContext<ThemeCtx>(null!);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setState] = useState<Branding | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setBranding = useCallback((b: Branding) => {
    setState(b);
    applyBranding(b);
    applyMeta(b);
    offlineCache.set(`branding:${b.slug}`, b);
    try {
      const lite: BrandLite = { slug: b.slug, displayName: b.displayName, logoUrl: b.logoUrl, colorPrimary: b.colorPrimary, colorSecondary: b.colorSecondary };
      localStorage.setItem(brandKey(b.slug), JSON.stringify(lite));
    } catch { /* almacenamiento no disponible: el loader usa el genérico */ }
  }, []);

  const load = useCallback(async (slug: string) => {
    setError(null);
    // 1) Pintar de inmediato con la caché (funciona sin red)
    const cached = await offlineCache.get<Branding>(`branding:${slug}`);
    if (cached) setBranding(cached);
    // 2) Actualizar desde el servidor
    try {
      const fresh = await http.get<Branding>(`/api/v1/public/tenants/${encodeURIComponent(slug)}`);
      setBranding(fresh);
      const locale = i18n.language as Locale;
      const overrides = await http.get<Record<string, string>>(`/api/v1/public/tenants/${encodeURIComponent(slug)}/translations/${locale}`);
      if (Object.keys(overrides).length) applyTenantOverrides(locale, overrides);
    } catch (e) {
      if (!cached) setError((e as { code?: string }).code ?? 'NETWORK');
    }
  }, [setBranding]);

  useEffect(() => () => { /* sin limpieza: el tema persiste entre rutas */ }, []);

  return <Ctx.Provider value={{ branding, error, load, setBranding }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
