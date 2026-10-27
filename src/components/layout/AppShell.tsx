import { NavLink, Outlet, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { assetUrl, useTheme } from '../../providers/theme';
import { useSync } from '../../providers/sync';
import { LangSwitch, Button } from '../ui';

interface NavItem { to: string; label: string; perm?: string; end?: boolean }

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
  const initials = (user?.fullName ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {platform || !branding
            ? <strong>{t('app.name')}</strong>
            : <img src={assetUrl(branding.logoUrl)} alt={branding.displayName} />}
        </div>
        <nav aria-label="principal">
          {sections.map((s, i) => {
            const visible = s.items.filter((it) => !it.perm || can(it.perm));
            if (!visible.length) return null;
            return (
              <div key={i}>
                {s.title && <div className="nav-section">{s.title}</div>}
                {visible.map((it) => (
                  <NavLink key={it.to} to={`${base}${it.to}`} end={it.end} className="nav-link">{it.label}</NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <div className="accent-bar" />
        <OfflineBanner />
        <header className="topbar">
          <span className="spacer" />
          <LangSwitch />
          <div className="row" style={{ gap: 8 }}>
            <span className="avatar" aria-hidden>{initials}</span>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600 }}>{user?.fullName}</div>
              <div className="muted" style={{ fontSize: 12 }}>{user?.roles.map((r) => t(`roles.${r}`, r)).join(', ')}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={async () => { const slug = user?.tenantSlug ?? ''; await logout(); nav(platform ? '/admin/login' : `/${slug}/login`); }}>
            {t('common.logout')}
          </Button>
        </header>
        <main><Outlet /></main>
      </div>
    </div>
  );
}
