import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Loader } from '../ui/Loader';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { assetUrl, useTheme } from '../../providers/theme';
import { useSync } from '../../providers/sync';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { disablePush } from '../../lib/notifications';
import { Icon } from '../ui/Icon';

interface NavItem { to: string; label: string; icon: string; perm?: string; end?: boolean }

/** expanded = menú completo · rail = minimizado (solo íconos) · hidden = oculto (se abre por un momento con ☰) */
export type SidebarMode = 'expanded' | 'rail' | 'hidden';
const KEY = 'bdt.sidebar';

function loadMode(): SidebarMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'expanded' || v === 'rail' || v === 'hidden') return v;
  } catch { /* sin almacenamiento */ }
  return 'expanded';
}

export function OfflineBanner() {
  const { online, pending } = useSync();
  const { t } = useTranslation();
  if (online && pending === 0) return null;
  return (
    <div className="banner banner-offline" role="status" data-testid="offline-banner">
      {!online && <span>{t('offline.banner')}</span>}
      {pending > 0 && <strong>{t('offline.pending', { count: pending })}</strong>}
    </div>
  );
}

export function AppShell({ base, sections, platform = false }: {
  base: string; platform?: boolean; sections: { title?: string; items: NavItem[] }[];
}) {
  const { user, logout, can } = useAuth();
  const { branding } = useTheme();
  const { t } = useTranslation();
  const nav = useNavigate();
  const location = useLocation();
  const [mode, setModeState] = useState<SidebarMode>(loadMode);
  const [peek, setPeek] = useState(false); // menú oculto mostrado temporalmente

  const setMode = (m: SidebarMode) => {
    setModeState(m);
    setPeek(false);
    try { localStorage.setItem(KEY, m); } catch { /* ignorar */ }
  };
  // al navegar, el menú temporal se cierra solo
  useEffect(() => { setPeek(false); }, [location.pathname]);
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPeek(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [peek]);

  const compact = mode === 'rail' && !peek;
  const toggleMenu = () => {
    if (mode === 'hidden' || window.matchMedia('(max-width: 900px)').matches) setPeek((p) => !p);
    else setMode(mode === 'expanded' ? 'rail' : 'expanded');
  };

  return (
    <div className={`shell shell-${mode}${peek ? ' shell-peek' : ''}`}>
      {peek && <div className="sidebar-scrim" onClick={() => setPeek(false)} aria-hidden />}
      <aside className={`sidebar${compact ? ' sidebar-rail' : ''}`} aria-label={t('nav.menu')} data-testid="sidebar" data-mode={peek ? 'peek' : mode}>
        <div className="sidebar-brand">
          {compact
            ? <span className="avatar" aria-hidden>{(branding?.name ?? 'B')[0]}</span>
            : platform || !branding ? <strong>{t('app.name')}</strong> : <img src={assetUrl(branding.logoUrl)} alt={branding.displayName} />}
        </div>
        <nav aria-label="principal">
          {sections.map((s, i) => {
            const visible = s.items.filter((it) => !it.perm || can(it.perm));
            if (!visible.length) return null;
            return (
              <div key={i}>
                {s.title && !compact && <div className="nav-section">{s.title}</div>}
                {s.title && compact && <hr className="nav-sep" />}
                {visible.map((it) => (
                  <NavLink key={it.to} to={`${base}${it.to}`} end={it.end} className="nav-link" onClick={() => setPeek(false)} title={compact ? it.label : undefined} aria-label={compact ? it.label : undefined}>
                    <Icon name={it.icon} />{!compact && <span>{it.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          {peek ? (
            <button className="nav-link" onClick={() => setMode('expanded')}><Icon name="pin" /><span>{t('nav.pinMenu')}</span></button>
          ) : (
            <>
              <button className="nav-link" onClick={() => setMode(mode === 'expanded' ? 'rail' : 'expanded')}
                title={compact ? t('nav.expand') : undefined} aria-label={mode === 'expanded' ? t('nav.minimize') : t('nav.expand')}>
                <Icon name={mode === 'expanded' ? 'chevronLeft' : 'chevronRight'} />{!compact && <span>{t('nav.minimize')}</span>}
              </button>
              <button className="nav-link" onClick={() => setMode('hidden')} title={compact ? t('nav.hide') : undefined} aria-label={t('nav.hide')}>
                <Icon name="eyeOff" />{!compact && <span>{t('nav.hide')}</span>}
              </button>
            </>
          )}
        </div>
      </aside>
      <div className="main">
        <div className="accent-bar" />
        <OfflineBanner />
        <header className="topbar">
          <button className="btn btn-ghost btn-sm icon-btn" onClick={toggleMenu} aria-label={t('nav.toggleMenu')} aria-expanded={mode === 'expanded' || peek} data-testid="menu-toggle">
            <Icon name="menu" />
          </button>
          <span className="spacer" />
          {!platform && <NotificationBell />}
          <UserMenu onLogout={async () => {
            const slug = user?.tenantSlug ?? '';
            if (!platform) await disablePush().catch(() => undefined); // un equipo compartido no sigue recibiendo avisos
            await logout(); nav(platform ? '/admin/login' : `/${slug}/login`);
          }} />
        </header>
        <main className="content"><Suspense fallback={<Loader variant="panel" />}><Outlet /></Suspense></main>
      </div>
    </div>
  );
}
