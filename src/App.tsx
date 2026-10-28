import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AuthProvider, homePath, useAuth } from './providers/auth';
import { ThemeProvider, useTheme } from './providers/theme';
import { SyncProvider } from './providers/sync';
import { TalentFiltersProvider } from './providers/talentFilters';
import { ToastProvider } from './components/ui/Toast';
import { AppShell } from './components/layout/AppShell';
import { Loader } from './components/ui/Loader';

// páginas con carga diferida (code splitting): mientras llegan se muestra el loader con el logo del tenant.
// Con sesión iniciada se precargan todas en segundo plano para que la navegación funcione sin conexión.
const pages = {
  login: () => import('./pages/auth/Login'),
  acceptInvitation: () => import('./pages/auth/AcceptInvitation'),
  home: () => import('./pages/tenant/Home'),
  branding: () => import('./pages/tenant/Branding'),
  users: () => import('./pages/tenant/Users'),
  apiKeys: () => import('./pages/tenant/ApiKeys'),
  talentsWorkspace: () => import('./pages/talents/TalentsWorkspace'),
  talentDetail: () => import('./pages/talents/TalentDetail'),
  favorites: () => import('./pages/favorites/Favorites'),
  blacklist: () => import('./pages/blacklist/Blacklist'),
  interviews: () => import('./pages/interviews/Interviews'),
  rqBoard: () => import('./pages/requirements/RequirementsBoard'),
  rqDetail: () => import('./pages/requirements/RequirementDetail'),
  clients: () => import('./pages/clients/Clients'),
  tenants: () => import('./pages/platform/Tenants'),
  apiKeyApprovals: () => import('./pages/platform/ApiKeyApprovals'),
  usage: () => import('./pages/platform/Usage'),
};
const prefetchPages = () => {
  const run = () => Object.values(pages).forEach((load) => { load().catch(() => { /* se reintenta al navegar */ }); });
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run); else setTimeout(run, 1500);
};
const Login = lazy(() => pages.login().then((m) => ({ default: m.Login })));
const AcceptInvitation = lazy(() => pages.acceptInvitation().then((m) => ({ default: m.AcceptInvitation })));
const Home = lazy(() => pages.home().then((m) => ({ default: m.Home })));
const Branding = lazy(() => pages.branding().then((m) => ({ default: m.Branding })));
const Users = lazy(() => pages.users().then((m) => ({ default: m.Users })));
const ApiKeys = lazy(() => pages.apiKeys().then((m) => ({ default: m.ApiKeys })));
const TalentsWorkspace = lazy(() => pages.talentsWorkspace().then((m) => ({ default: m.TalentsWorkspace })));
const TalentPlaceholder = lazy(() => pages.talentsWorkspace().then((m) => ({ default: m.TalentPlaceholder })));
const TalentDetail = lazy(() => pages.talentDetail().then((m) => ({ default: m.TalentDetail })));
const Favorites = lazy(() => pages.favorites().then((m) => ({ default: m.Favorites })));
const Blacklist = lazy(() => pages.blacklist().then((m) => ({ default: m.Blacklist })));
const Interviews = lazy(() => pages.interviews().then((m) => ({ default: m.Interviews })));
const RequirementsBoard = lazy(() => pages.rqBoard().then((m) => ({ default: m.RequirementsBoard })));
const RequirementDetail = lazy(() => pages.rqDetail().then((m) => ({ default: m.RequirementDetail })));
const Clients = lazy(() => pages.clients().then((m) => ({ default: m.Clients })));
const Tenants = lazy(() => pages.tenants().then((m) => ({ default: m.Tenants })));
const ApiKeyApprovals = lazy(() => pages.apiKeyApprovals().then((m) => ({ default: m.ApiKeyApprovals })));
const Usage = lazy(() => pages.usage().then((m) => ({ default: m.Usage })));

const DEFAULT_TENANT = (import.meta.env.VITE_DEFAULT_TENANT as string | undefined) ?? 'fractal';

const queryClient = new QueryClient({
  defaultOptions: {
    // networkMode offlineFirst: con caché disponible se muestra aunque no haya red
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst' },
  },
});

function Splash() {
  return <Loader variant="screen" delay={0} />;
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
  useEffect(() => { if (user) prefetchPages(); }, [user]);
  if (!ready) return <Splash />;
  if (!user) return <Navigate to={`/${tenant}/login`} replace />;
  if (user.isPlatform) return <Navigate to="/admin" replace />;
  if (user.tenantSlug !== tenant) return <Navigate to={homePath(user)} replace />;
  // filtros de talentos en memoria: se descartan al cerrar sesión (este árbol se desmonta)
  return <TalentFiltersProvider>{children}</TalentFiltersProvider>;
}

function PlatformArea({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  useEffect(() => { if (user) prefetchPages(); }, [user]);
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
          { items: [{ to: '', label: t('nav.home'), icon: 'home', end: true }, { to: '/talentos', label: t('nav.talents'), icon: 'talents', perm: 'talent.read' }, { to: '/requerimientos', label: t('nav.requirements'), icon: 'requirements', perm: 'rq.read' }, { to: '/favoritos', label: t('nav.favorites'), icon: 'heart', perm: 'talent.read' }, { to: '/entrevistas', label: t('nav.interviews'), icon: 'interviews', perm: 'interview.read' }, { to: '/lista-negra', label: t('nav.blacklist'), icon: 'ban', perm: 'talent.read' }] },
          { title: t('nav.administration'), items: [
            { to: '/clientes', label: t('nav.clients'), icon: 'building', perm: 'tenant.masters.manage' },
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
          <Route path="favoritos" element={<Favorites />} />
          <Route path="favoritos/:id" element={<Favorites />} />
          <Route path="requerimientos" element={<RequirementsBoard />} />
          <Route path="requerimientos/:id" element={<RequirementDetail />} />
          <Route path="entrevistas" element={<Interviews />} />
          <Route path="entrevistas/:id" element={<Interviews />} />
          <Route path="lista-negra" element={<Blacklist />} />
          <Route path="lista-negra/:id" element={<Blacklist />} />
          <Route path="clientes" element={<Clients />} />
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
            { to: '/consumo', label: t('nav.usage'), icon: 'chart', perm: 'platform.usage.read' },
          ] },
        ]} />}>
          <Route index element={<Tenants />} />
          <Route path="api-keys" element={<ApiKeyApprovals />} />
          <Route path="consumo" element={<Usage />} />
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
                <Suspense fallback={<Splash />}>
                <Routes>
                  <Route path="/" element={<Navigate to={`/${DEFAULT_TENANT}/login`} replace />} />
                  <Route path="/404" element={<NotFound />} />
                  <Route path="/admin/login" element={<Login platform />} />
                  <Route path="/admin/*" element={<PlatformRoutes />} />
                  <Route path="/invitacion/:token" element={<AcceptInvitation />} />
                  <Route path="/:tenant/login" element={<Login />} />
                  <Route path="/:tenant/*" element={<TenantRoutes />} />
                </Routes>
                </Suspense>
              </BrowserRouter>
            </SyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
