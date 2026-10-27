import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AuthProvider, homePath, useAuth } from './providers/auth';
import { ThemeProvider, useTheme } from './providers/theme';
import { SyncProvider } from './providers/sync';
import { TalentFiltersProvider } from './providers/talentFilters';
import { ToastProvider } from './components/ui/Toast';
import { AppShell } from './components/layout/AppShell';
import { Login } from './pages/auth/Login';
import { AcceptInvitation } from './pages/auth/AcceptInvitation';
import { Home } from './pages/tenant/Home';
import { Branding } from './pages/tenant/Branding';
import { Users } from './pages/tenant/Users';
import { ApiKeys } from './pages/tenant/ApiKeys';
import { TalentPlaceholder, TalentsWorkspace } from './pages/talents/TalentsWorkspace';
import { TalentDetail } from './pages/talents/TalentDetail';
import { Tenants } from './pages/platform/Tenants';
import { ApiKeyApprovals } from './pages/platform/ApiKeyApprovals';

const DEFAULT_TENANT = (import.meta.env.VITE_DEFAULT_TENANT as string | undefined) ?? 'fractal';

const queryClient = new QueryClient({
  defaultOptions: {
    // networkMode offlineFirst: con caché disponible se muestra aunque no haya red
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst' },
  },
});

function Splash() {
  const { t } = useTranslation();
  return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }} className="muted">{t('common.loading')}</div>;
}

function NotFound() {
  const { t } = useTranslation();
  return <div className="page"><h1>404</h1><p className="muted">{t('errors.NOT_FOUND')}</p></div>;
}

/** Área de un tenant: exige sesión de ese mismo tenant y aplica su branding. */
function TenantArea({ children }: { children: ReactNode }) {
  const { tenant = '' } = useParams();
  const { user, ready } = useAuth();
  const { load, branding } = useTheme();
  useEffect(() => { if (branding?.slug !== tenant) load(tenant); }, [tenant, branding?.slug, load]);
  if (!ready) return <Splash />;
  if (!user) return <Navigate to={`/${tenant}/login`} replace />;
  if (user.isPlatform) return <Navigate to="/admin" replace />;
  if (user.tenantSlug !== tenant) return <Navigate to={homePath(user)} replace />;
  // filtros de talentos en memoria: se descartan al cerrar sesión (este árbol se desmonta)
  return <TalentFiltersProvider>{children}</TalentFiltersProvider>;
}

function PlatformArea({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!user.isPlatform) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

function PlatformTenantUsers() {
  const { id = '' } = useParams();
  return <Users base="/api/v1/platform" query={`?tenantId=${encodeURIComponent(id)}`} />;
}

function TenantRoutes() {
  const { tenant = '' } = useParams();
  const { t } = useTranslation();
  return (
    <TenantArea>
      <Routes>
        <Route element={<AppShell base={`/${tenant}`} sections={[
          { items: [{ to: '', label: t('nav.home'), icon: 'home', end: true }, { to: '/talentos', label: t('nav.talents'), icon: 'talents', perm: 'talent.read' }] },
          { title: t('nav.administration'), items: [
            { to: '/marca', label: t('nav.branding'), icon: 'brush', perm: 'tenant.branding.manage' },
            { to: '/usuarios', label: t('nav.users'), icon: 'users', perm: 'tenant.users.manage' },
            { to: '/api', label: t('nav.apiKeys'), icon: 'key', perm: 'tenant.apikeys.request' },
          ] },
        ]} />}>
          <Route index element={<Home />} />
          <Route path="talentos" element={<TalentsWorkspace />}>
            <Route index element={<TalentPlaceholder />} />
            <Route path=":id" element={<TalentDetail />} />
          </Route>
          <Route path="marca" element={<Branding />} />
          <Route path="usuarios" element={<Users />} />
          <Route path="api" element={<ApiKeys />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </TenantArea>
  );
}

function PlatformRoutes() {
  const { t } = useTranslation();
  return (
    <PlatformArea>
      <Routes>
        <Route element={<AppShell base="/admin" platform sections={[
          { title: t('nav.platform'), items: [
            { to: '', label: t('nav.tenants'), icon: 'building', end: true },
            { to: '/api-keys', label: t('nav.approvals'), icon: 'check', perm: 'platform.apikeys.approve' },
          ] },
        ]} />}>
          <Route index element={<Tenants />} />
          <Route path="api-keys" element={<ApiKeyApprovals />} />
          <Route path="tenants/:id/users" element={<PlatformTenantUsers />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </PlatformArea>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ThemeProvider>
          <AuthProvider>
            <SyncProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Navigate to={`/${DEFAULT_TENANT}/login`} replace />} />
                  <Route path="/404" element={<NotFound />} />
                  <Route path="/admin/login" element={<Login platform />} />
                  <Route path="/admin/*" element={<PlatformRoutes />} />
                  <Route path="/invitacion/:token" element={<AcceptInvitation />} />
                  <Route path="/:tenant/login" element={<Login />} />
                  <Route path="/:tenant/*" element={<TenantRoutes />} />
                </Routes>
              </BrowserRouter>
            </SyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
