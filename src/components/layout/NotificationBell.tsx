// Campana de notificaciones (barra superior del tenant): no leídas, bandeja con "Todas / No leídas", marcar como leídas,
// ir a la ficha relacionada, activar el push del sistema operativo y preferencias por tipo.
// Cuando llega una notificación nueva con la app abierta se muestra además un aviso breve (toast).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Check, ClipboardList, LifeBuoy, MessageSquareReply, Pencil, Settings, Sparkles, UserPlus } from 'lucide-react';
import { useAuth } from '../../providers/auth';
import {
  INBOX_KEY, disablePush, setNotificationScope, enablePush, getPrefs, notificationLink, notificationText, olderNotifications, pushState, setPref, timeAgo,
  useInbox, useMarkRead, type AppNotification, type Inbox, type NotificationPrefs, type PushState,
} from '../../lib/notifications';
import { Button, Modal, useErrorText } from '../ui';
import { useToast } from '../ui/Toast';

export function NotificationBell({ platform = false }: { platform?: boolean }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  setNotificationScope(platform);
  const inbox = useInbox(!!user && (platform || !!user.tenantSlug));
  const markRead = useMarkRead();
  const { mutate: read } = markRead;
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const slug = user?.tenantSlug ?? '';

  useEffect(() => {
    if (!open) return;
    void pushState().then(setPush);
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // aviso breve de lo nuevo que llega mientras la app está abierta (no al cargar por primera vez)
  useEffect(() => {
    const items = inbox.data?.items;
    if (!items) return;
    if (!seen.current) { seen.current = new Set(items.map((n) => n.id + n.at)); return; }
    const fresh = items.filter((n) => !n.readAt && !seen.current!.has(n.id + n.at));
    fresh.forEach((n) => seen.current!.add(n.id + n.at));
    if (fresh.length === 1) toast.info(notificationText(fresh[0], t));
    else if (fresh.length > 1) toast.info(t('notifications.newMany', { count: fresh.length }));
  }, [inbox.data, t, toast]);

  // clic en la notificación del sistema con la app abierta: el service worker pide navegar
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'bdt:navigate') return;
      if (e.data.id) read(e.data.id);
      nav(new URL(e.data.url).pathname);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [read, nav]);

  const go = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    nav(notificationLink(n, slug));
  };
  const loadMore = async () => {
    const items = inbox.data?.items ?? [];
    if (!items.length) return;
    setMore(true);
    try {
      const older = await olderNotifications(items[items.length - 1].at);
      qc.setQueryData<Inbox>(INBOX_KEY, (cur) => cur && { ...cur, items: [...cur.items, ...older.items.filter((o) => !cur.items.some((x) => x.id === o.id))] });
    } finally {
      setMore(false);
    }
  };
  const togglePush = async (on: boolean) => {
    try { setPush(on ? await enablePush() : await disablePush()); } catch { setPush(await pushState()); toast.error(t('notifications.push.error')); }
  };

  const unread = inbox.data?.unread ?? 0;
  const items = (inbox.data?.items ?? []).filter((n) => !onlyUnread || !n.readAt);
  return (
    <div className="notif" ref={ref}>
      <button type="button" className="btn btn-ghost btn-sm icon-btn notif-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? t('notifications.titleUnread', { count: unread }) : t('notifications.title')} data-testid="notif-bell">
        {unread ? <BellRing size={19} /> : <Bell size={19} />}
        {unread > 0 && <span className="notif-badge" data-testid="notif-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-pop" role="dialog" aria-label={t('notifications.title')} data-testid="notif-panel">
          <header className="notif-head">
            <strong>{t('notifications.title')}</strong>
            <span className="spacer" />
            <button type="button" className="link-btn" onClick={() => markRead.mutate(undefined)} disabled={!unread} data-testid="notif-read-all">
              <Check size={14} />{t('notifications.readAll')}</button>
            <button type="button" className="icon-ghost" onClick={() => { setOpen(false); setPrefs(true); }} aria-label={t('notifications.prefs.title')} title={t('notifications.prefs.title')} data-testid="notif-prefs">
              <Settings size={16} /></button>
          </header>
          <div className="notif-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!onlyUnread} onClick={() => setOnlyUnread(false)}>{t('notifications.all')}</button>
            <button type="button" role="tab" aria-selected={onlyUnread} onClick={() => setOnlyUnread(true)}>{t('notifications.unread')}{unread > 0 && ` (${unread})`}</button>
          </div>
          {push === 'off' && (
            <div className="notif-push" data-testid="notif-push-offer">
              <BellRing size={16} aria-hidden /><span className="grow">{t('notifications.push.offer')}</span>
              <Button size="sm" onClick={() => togglePush(true)} data-testid="notif-push-enable">{t('notifications.push.enable')}</Button>
            </div>
          )}
          {push === 'denied' && <div className="notif-push muted">{t('notifications.push.denied')}</div>}
          <div className="notif-list">
            {inbox.isLoading && <p className="muted notif-empty">{t('common.loading')}</p>}
            {inbox.data && items.length === 0 && <p className="muted notif-empty">{onlyUnread ? t('notifications.noneUnread') : t('notifications.none')}</p>}
            {items.map((n) => (
              <button type="button" key={n.id} className={`notif-item${n.readAt ? '' : ' unread'}`} onClick={() => go(n)} data-testid="notif-item">
                <span className={`notif-ico ${n.type.endsWith('_CREATED') || n.type === 'SUPPORT_NEW' || n.type === 'RELEASE_NOTE' ? 'new' : 'upd'}`}>{n.type === 'TALENT_CREATED' ? <UserPlus size={15} /> : n.type === 'RQ_CREATED' ? <ClipboardList size={15} /> : n.type === 'SUPPORT_NEW' ? <LifeBuoy size={15} /> : n.type === 'SUPPORT_REPLY' ? <MessageSquareReply size={15} /> : n.type === 'RELEASE_NOTE' ? <Sparkles size={15} /> : <Pencil size={14} />}</span>
                <span className="notif-body">
                  <span className="notif-text">{notificationText(n, t)}</span>
                  {(n.payload.headline || n.payload.client) && <span className="notif-sub">{n.payload.headline || n.payload.client}</span>}
                  <span className="notif-time">{timeAgo(n.at, i18n.language)}</span>
                </span>
                {!n.readAt && <span className="notif-dot" aria-label={t('notifications.unreadOne')} />}
              </button>
            ))}
            {!onlyUnread && (inbox.data?.items.length ?? 0) >= 30 && (
              <button type="button" className="link-btn notif-more" onClick={loadMore} disabled={more}>{t('notifications.more')}</button>
            )}
          </div>
        </div>
      )}
      {prefs && <PrefsModal onClose={() => setPrefs(false)} push={push} onPush={togglePush} />}
    </div>
  );
}

/** Preferencias: qué tipos llegan a la bandeja y cuáles también como push; push en este dispositivo. */
function PrefsModal({ onClose, push, onPush }: { onClose: () => void; push: PushState | null; onPush: (on: boolean) => Promise<void> }) {
  const { t } = useTranslation();
  const errText = useErrorText();
  const toast = useToast();
  const [data, setData] = useState<NotificationPrefs | null>(null);
  const [state, setState] = useState<PushState | null>(push);
  useEffect(() => { void getPrefs().then(setData).catch((e) => toast.error(errText(e))); void pushState().then(setState); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = async (type: string, k: 'inApp' | 'push', v: boolean) => {
    if (!data) return;
    const next = data.types.map((p) => (p.type === type ? { ...p, [k]: v } : p));
    setData({ ...data, types: next });
    try { await setPref(next.find((p) => p.type === type)!); } catch (e) { toast.error(errText(e)); }
  };
  const device = async (on: boolean) => { await onPush(on); setState(await pushState()); setData(await getPrefs()); };
  return (
    <Modal open title={t('notifications.prefs.title')} onClose={onClose} footer={<><span className="spacer" /><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button></>}>
      <div className="stack" data-testid="notif-prefs-modal">
        <section className="notif-device">
          <strong>{t('notifications.prefs.device')}</strong>
          <span className="muted">{t(`notifications.push.state.${state ?? 'unsupported'}`)}</span>
          {state === 'off' && <div><Button size="sm" onClick={() => device(true)}>{t('notifications.push.enable')}</Button></div>}
          {state === 'on' && <div><Button size="sm" variant="secondary" onClick={() => device(false)}>{t('notifications.push.disable')}</Button></div>}
          {data && <span className="muted" style={{ fontSize: 12 }}>{t('notifications.prefs.devices', { count: data.devices })}</span>}
        </section>
        <table className="table notif-prefs">
          <thead><tr><th>{t('notifications.prefs.type')}</th><th>{t('notifications.prefs.inApp')}</th><th>{t('notifications.prefs.push')}</th></tr></thead>
          <tbody>
            {data?.types.map((p) => (
              <tr key={p.type}>
                <td>{t(`notifications.types.${p.type}`)}</td>
                <td><input type="checkbox" checked={p.inApp} onChange={(e) => change(p.type, 'inApp', e.target.checked)} aria-label={`${t(`notifications.types.${p.type}`)} · ${t('notifications.prefs.inApp')}`} data-testid={`pref-${p.type}-inApp`} /></td>
                <td><input type="checkbox" checked={p.push} onChange={(e) => change(p.type, 'push', e.target.checked)} aria-label={`${t(`notifications.types.${p.type}`)} · ${t('notifications.prefs.push')}`} data-testid={`pref-${p.type}-push`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t('notifications.prefs.hint')}</p>
      </div>
    </Modal>
  );
}
