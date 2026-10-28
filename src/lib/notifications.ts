// Notificaciones: bandeja del usuario (sondeo cada minuto + aviso inmediato del service worker cuando llega un push)
// y push del sistema operativo para la app instalada (Web Push con la clave pública VAPID del servidor).
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { http } from './api';

export type NotificationType = 'TALENT_CREATED' | 'TALENT_UPDATED' | 'RQ_CREATED' | 'RQ_UPDATED';
export type AppNotification = {
  id: string; type: NotificationType; entityType: 'TALENT' | 'REQUIREMENT'; entityId: string; payload: { name?: string; headline?: string; code?: string; title?: string; client?: string; status?: string };
  count: number; createdAt: string; at: string; readAt?: string; actor?: { id: string; name: string };
};
export type Inbox = { unread: number; items: AppNotification[] };
export type NotificationPref = { type: NotificationType; inApp: boolean; push: boolean };
export type NotificationPrefs = { types: NotificationPref[]; devices: number };

const API = '/api/v1/tenant/notifications';
export const INBOX_KEY = ['notifications'];
const POLL_MS = 60_000;

export function useInbox(enabled = true) {
  const qc = useQueryClient();
  // el service worker avisa cuando llega un push: se actualiza la bandeja al instante
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'bdt:notification') void qc.invalidateQueries({ queryKey: INBOX_KEY }); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [enabled, qc]);
  return useQuery({
    queryKey: INBOX_KEY, enabled, refetchInterval: POLL_MS, refetchOnWindowFocus: true, networkMode: 'online',
    queryFn: () => http.get<Inbox>(`${API}?limit=30`),
  });
}

export const olderNotifications = (before: string) => http.get<Inbox>(`${API}?limit=30&before=${encodeURIComponent(before)}`);

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) => http.post(`${API}/read`, id ? { id } : {}),
    // optimista: la campana baja de inmediato
    onMutate: (id?: string) => {
      const now = new Date().toISOString();
      qc.setQueryData<Inbox>(INBOX_KEY, (cur) => cur && {
        unread: id ? Math.max(0, cur.unread - (cur.items.some((n) => n.id === id && !n.readAt) ? 1 : 0)) : 0,
        items: cur.items.map((n) => (!id || n.id === id) && !n.readAt ? { ...n, readAt: now } : n),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: INBOX_KEY }),
  });
}

export const getPrefs = () => http.get<NotificationPrefs>(`${API}/prefs`);
export const setPref = (p: NotificationPref) => http.put(`${API}/prefs`, p);

/** Texto de la notificación en el idioma del usuario. */
export function notificationText(n: AppNotification, t: TFunction) {
  const who = n.actor?.name || t('notifications.someone');
  const name = n.payload.name || '—';
  return t(`notifications.text.${n.type}`, { who, name, code: n.payload.code ?? '', title: n.payload.title ?? '', defaultValue: n.type }) + (n.count > 1 ? ` ${t('notifications.changes', { count: n.count })}` : '');
}

export const notificationLink = (n: AppNotification, slug: string) =>
  n.entityType === 'TALENT' ? `/${slug}/talentos/${n.entityId}` : n.entityType === 'REQUIREMENT' ? `/${slug}/requerimientos/${n.entityId}` : `/${slug}`;

export function timeAgo(iso: string, lang: string) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(Math.round(s), 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(iso).toLocaleDateString(lang, { day: '2-digit', month: 'short' });
}

// ---------- Push del sistema operativo ----------

export type PushState = 'unsupported' | 'disabled-server' | 'denied' | 'off' | 'on';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Service worker de la PWA (solo existe en la app compilada/instalada, no en el servidor de desarrollo). */
async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const key = await http.get<{ enabled: boolean; publicKey: string }>(`${API}/push/key`).catch(() => null);
  if (!key?.enabled) return 'disabled-server';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await swRegistration();
  if (!reg) return 'unsupported';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Pide permiso (debe llamarse desde un clic), suscribe el dispositivo y lo registra en el servidor. */
export async function enablePush(): Promise<PushState> {
  const reg = await swRegistration();
  if (!reg) return 'unsupported';
  const key = await http.get<{ enabled: boolean; publicKey: string }>(`${API}/push/key`);
  if (!key.enabled) return 'disabled-server';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key.publicKey) }));
  await http.post(`${API}/push/subscribe`, sub.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await swRegistration())?.pushManager.getSubscription();
  if (sub) {
    await http.post(`${API}/push/unsubscribe`, { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}
