// Cliente HTTP. El access token vive SOLO en memoria (nunca en localStorage);
// el refresh token es una cookie HttpOnly que el navegador envía a /api/v1/auth.
import { enqueue } from './offline';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(t: string | null) { accessToken = t; }
export function getAccessToken() { return accessToken; }
export function setSessionLostHandler(fn: () => void) { onSessionLost = fn; }

export interface SessionResponse {
  accessToken: string;
  expiresAt: string;
  user: Me;
}

export interface Me {
  id: string;
  fullName: string;
  email: string;
  locale: string;
  tenantSlug?: string;
  roles: string[];
  permissions: string[];
  isPlatform: boolean;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.code ?? 'INTERNAL', res.status);
  return body as T;
}

/** Renueva el access token con la cookie de refresh (una sola petición concurrente). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return false;
      const s = (await r.json()) as SessionResponse;
      accessToken = s.accessToken;
      lastSession = s;
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

let lastSession: SessionResponse | null = null;
export function takeLastSession() { const s = lastSession; lastSession = null; return s; }

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Si no hay red, guardar la operación en la cola offline en vez de fallar. */
  queueOffline?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const isForm = opts.body instanceof FormData;
  const doFetch = () => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    return fetch(`${API_URL}${path}`, {
      method, headers, credentials: 'include', signal: opts.signal,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  };

  if (!navigator.onLine && opts.queueOffline && method !== 'GET') {
    await enqueue({ path, method, body: opts.body });
    throw new ApiError('OFFLINE', 0);
  }

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    if (opts.queueOffline && method !== 'GET') {
      await enqueue({ path, method, body: opts.body });
      throw new ApiError('OFFLINE', 0);
    }
    throw new ApiError('NETWORK', 0);
  }
  if (res.status === 401 && !path.startsWith('/api/v1/auth/')) {
    if (await refreshSession()) {
      res = await doFetch();
    } else {
      accessToken = null;
      onSessionLost?.();
    }
  }
  return parse<T>(res);
}

export const http = {
  get: <T,>(p: string) => api<T>(p),
  post: <T,>(p: string, body?: unknown, queueOffline = false) => api<T>(p, { method: 'POST', body, queueOffline }),
  put: <T,>(p: string, body?: unknown, queueOffline = false) => api<T>(p, { method: 'PUT', body, queueOffline }),
  patch: <T,>(p: string, body?: unknown, queueOffline = false) => api<T>(p, { method: 'PATCH', body, queueOffline }),
  del: <T,>(p: string) => api<T>(p, { method: 'DELETE' }),
};
