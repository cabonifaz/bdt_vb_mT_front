import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_URL, getAccessToken, refreshSession } from '../lib/api';
import { flush, onPendingChange, type QueuedOp } from '../lib/offline';
import { useToast } from '../components/ui/Toast';
import { useTranslation } from 'react-i18next';

interface SyncCtx { online: boolean; pending: number }
const Ctx = createContext<SyncCtx>({ online: true, pending: 0 });

async function send(op: QueuedOp) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Client-Op-Id': op.id };
  const t = getAccessToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch(`${API_URL}${op.path}`, {
    method: op.method, headers, credentials: 'include',
    body: op.body === undefined ? undefined : JSON.stringify(op.body),
  });
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => onPendingChange(setPending), []);

  useEffect(() => {
    const up = async () => {
      setOnline(true);
      await refreshSession();
      const n = await flush(send);
      if (n > 0) toast.success(t('offline.synced'));
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [toast, t]);

  return <Ctx.Provider value={{ online, pending }}>{children}</Ctx.Provider>;
}

export const useSync = () => useContext(Ctx);
