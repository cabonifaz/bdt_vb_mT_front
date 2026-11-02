// Versión de la plataforma publicada en el ambiente: se muestra junto al logo (con su estado y, fuera de prod, el
// ambiente) y se consulta cada 5 minutos para avisar cuando se publica una nueva.
import { useQuery } from '@tanstack/react-query';
import { http } from './api';

export type VersionStatus = 'TESTING' | 'CANDIDATE' | 'STABLE' | 'WITHDRAWN';
export const VERSION_STATUSES: VersionStatus[] = ['TESTING', 'CANDIDATE', 'STABLE', 'WITHDRAWN'];
export type AppVersion = {
  version: string; environment: string; status: VersionStatus; commit?: string | null; notes: string[]; publishedAt?: string; statusAt?: string | null;
  current?: boolean; error?: string;
};

export const useVersion = () => useQuery({
  queryKey: ['app-version'], refetchInterval: 5 * 60_000, refetchOnWindowFocus: true, staleTime: 60_000, retry: false,
  queryFn: () => http.get<AppVersion>('/api/v1/version'),
});
export const useVersions = () => useQuery({ queryKey: ['app-versions'], queryFn: () => http.get<AppVersion[]>('/api/v1/versions') });
export const useEnvironments = (enabled: boolean) => useQuery({ queryKey: ['app-versions', 'envs'], enabled, queryFn: () => http.get<AppVersion[]>('/api/v1/platform/versions/environments') });
export const setVersionStatus = (version: string, status: VersionStatus) => http.patch(`/api/v1/platform/versions/${version}`, { status });

/** Producción no se rotula; los demás ambientes sí (Staging, Preprod, Local). */
export const isProd = (env?: string) => env === 'production' || env === 'prod';
