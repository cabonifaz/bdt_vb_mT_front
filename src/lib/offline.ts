// Trabajo sin conexión:
// - Cola (outbox) en IndexedDB con las operaciones hechas sin red. Cada una lleva un
//   id único (X-Client-Op-Id) para que el backend las aplique una sola vez.
// - Caché de lectura (branding, maestros, listas) para seguir operando sin red.
import { createStore, del, entries, get, set } from 'idb-keyval';

const outbox = createStore('bdt-offline', 'outbox');
const cache = createStore('bdt-cache', 'kv');

export interface QueuedOp {
  id: string;
  path: string;
  method: string;
  body?: unknown;
  createdAt: string;
  attempts: number;
}

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

export function onPendingChange(fn: Listener) {
  listeners.add(fn);
  pendingCount().then(fn);
  return () => { listeners.delete(fn); };
}

async function notify() {
  const n = await pendingCount();
  listeners.forEach((l) => l(n));
}

export async function enqueue(op: { path: string; method: string; body?: unknown }) {
  const q: QueuedOp = { ...op, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0 };
  await set(q.id, q, outbox);
  await notify();
}

export async function pendingCount() {
  return (await entries(outbox)).length;
}

let flushing = false;

/** Reenvía la cola en orden de creación. Se detiene ante errores de red. */
export async function flush(send: (op: QueuedOp) => Promise<Response>): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const ops = (await entries<string, QueuedOp>(outbox)).map(([, v]) => v)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const op of ops) {
      let res: Response;
      try {
        res = await send(op);
      } catch {
        break; // sin red de nuevo
      }
      // 2xx aplicado; 4xx rechazo de negocio (no reintentar). 5xx/401: reintentar luego.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429)) {
        await del(op.id, outbox);
        sent++;
      } else {
        await set(op.id, { ...op, attempts: op.attempts + 1 }, outbox);
        break;
      }
    }
  } finally {
    flushing = false;
    await notify();
  }
  return sent;
}

export const offlineCache = {
  get: <T,>(key: string) => get<T>(key, cache),
  set: (key: string, value: unknown) => set(key, value, cache),
};
