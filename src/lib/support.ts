// Soporte (solicitudes al Super Admin), novedades de la plataforma y guías de primer uso.
// Las solicitudes llevan el origen: la pantalla desde donde se pidió, armado aquí a partir de la ruta y la página.
import { useQuery } from '@tanstack/react-query';
import { http, API_URL, ApiError, getAccessToken, refreshSession } from './api';

export type SupportKind = 'INCIDENT' | 'OBSERVATION' | 'IMPROVEMENT';
export type SupportImpact = 'LOW' | 'MEDIUM' | 'HIGH';
export type SupportStatus = 'OPEN' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';
export const SUPPORT_KINDS: SupportKind[] = ['INCIDENT', 'OBSERVATION', 'IMPROVEMENT'];
export const SUPPORT_IMPACTS: SupportImpact[] = ['LOW', 'MEDIUM', 'HIGH'];
export const SUPPORT_STATUSES: SupportStatus[] = ['OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'];

export type SupportOrigin = { module: string; screen: string; path: string; entity?: string | null; app: string; viewport: string; lang: string; userAgent: string };
export type SupportAttachment = { id: string; name: string; mimeType: string; size: number };
export type SupportMessage = { id: string; isStaff: boolean; body: string; statusTo?: SupportStatus | null; at: string; authorName?: string; attachments: SupportAttachment[] };
export type SupportSummary = {
  id: string; number: number; kind: SupportKind; impact: SupportImpact; title: string; status: SupportStatus; createdAt: string; updatedAt: string;
  lastStaffAt?: string | null; origin: SupportOrigin; tenant: { slug: string; name: string }; reporterName?: string; messages: number; attachments: number;
};
export type SupportTicket = Omit<SupportSummary, 'messages' | 'attachments' | 'reporterName'> & {
  refs?: string[] | null; closedAt?: string | null; canManage: boolean; reporter: { id: string; name?: string }; messages: SupportMessage[];
};
export type ReleaseNote = { id: string; title: Record<string, string>; body: Record<string, string>; module?: string | null; tourKey?: string | null; publishedAt: string };

const API = '/api/v1/support';

export const useTickets = (status: string, q: string) => useQuery({
  queryKey: ['support', status, q],
  queryFn: () => http.get<SupportSummary[]>(`${API}?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q.trim())}`),
  placeholderData: (prev) => prev, refetchInterval: 60_000,
});
export const useTicket = (id?: string) => useQuery({
  queryKey: ['support', 'ticket', id], enabled: !!id, refetchInterval: 30_000,
  queryFn: () => http.get<SupportTicket>(`${API}/${id}`),
});

export type NewTicket = { kind: SupportKind; impact: SupportImpact; title: string; body: string; origin: SupportOrigin; refs: string[]; files: string[] };
export const createTicket = (t: NewTicket) => http.post<{ id: string; number: number }>(API, t);
export const replyTicket = (id: string, body: string, status: SupportStatus | '' = '', files: string[] = []) =>
  http.post<{ status: SupportStatus }>(`${API}/${id}/messages`, { body, status, files });

export async function uploadSupportFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await http.post<{ id: string }>(`${API}/files`, form)).id;
}

/** Imagen o archivo de una solicitud (requiere sesión). */
export async function supportFileBlob(id: string): Promise<Blob> {
  const doFetch = () => fetch(`${API_URL}${API}/files/${id}?inline=1`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, credentials: 'include' });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) res = await doFetch();
  if (!res.ok) throw new ApiError('NOT_FOUND', res.status);
  return res.blob();
}

export const useReleases = () => useQuery({ queryKey: ['releases'], queryFn: () => http.get<ReleaseNote[]>('/api/v1/releases'), staleTime: 60_000 });
export const publishRelease = (r: { title: Record<string, string>; body: Record<string, string>; module: string; tourKey: string }) =>
  http.post<{ id: string }>('/api/v1/releases', r);

// ---------------- Origen de la solicitud ----------------
/** Módulo según la ruta (/:tenant/<segmento>/... o /admin/<segmento>). */
const MODULES: Record<string, string> = {
  '': 'home', talentos: 'talents', requerimientos: 'requirements', favoritos: 'favorites', entrevistas: 'interviews', 'lista-negra': 'blacklist',
  clientes: 'clients', documentos: 'documents', marca: 'branding', usuarios: 'users', api: 'api-keys', soporte: 'support', novedades: 'news',
  'api-keys': 'api-keys', consumo: 'usage', tenants: 'tenants',
};

/** Datos de la pantalla actual que acompañan a la solicitud (no incluye datos personales). */
export function currentOrigin(pathname: string): SupportOrigin {
  const parts = pathname.split('/').filter(Boolean);
  const seg = parts[0] === 'admin' ? (parts[1] ?? '') : (parts[1] ?? '');
  const entity = parts.find((p) => /^[0-9a-f-]{36}$/i.test(p)) ?? null;
  // la pantalla se reconoce por su título (o el del modal abierto)
  const heading = document.querySelector('[role="dialog"] h3')?.textContent || document.querySelector('.content h1')?.textContent || document.title;
  return {
    module: MODULES[seg] ?? seg, screen: (heading ?? '').trim().slice(0, 150), path: pathname.slice(0, 200), entity,
    app: matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'web', viewport: `${innerWidth}x${innerHeight}`,
    lang: navigator.language, userAgent: navigator.userAgent.slice(0, 200),
  };
}

// ---------------- Guías de primer uso ----------------
export const getTours = () => http.get<Record<string, number>>('/api/v1/me/tours');
export const markTourSeen = (key: string, version: number) => http.put(`/api/v1/me/tours/${key}`, { version });
