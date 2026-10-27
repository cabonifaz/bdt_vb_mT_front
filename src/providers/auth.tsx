import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  http, refreshSession, setAccessToken, setSessionLostHandler, takeLastSession,
  type Me, type SessionResponse,
} from '../lib/api';
import { setLocale } from '../i18n';

interface AuthCtx {
  user: Me | null;
  ready: boolean;
  login: (tenant: string | null, email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const adopt = useCallback((s: SessionResponse) => {
    setAccessToken(s.accessToken);
    setUser(s.user);
    if (s.user.locale === 'es' || s.user.locale === 'en') setLocale(s.user.locale);
  }, []);

  // Al cargar: recuperar la sesión con la cookie de refresh (si existe)
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    refreshSession().then((ok) => {
      const s = ok ? takeLastSession() : null;
      if (s) adopt(s);
      setReady(true);
    });
  }, [adopt]);

  // Renovación proactiva del access token antes de que venza
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      if (navigator.onLine) refreshSession().then((ok) => { const s = ok ? takeLastSession() : null; if (s) setUser(s.user); });
    }, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [user]);

  const login = useCallback(async (tenant: string | null, email: string, password: string) => {
    const s = await http.post<SessionResponse>('/api/v1/auth/login', { tenant: tenant ?? '', email, password });
    adopt(s);
    return s.user;
  }, [adopt]);

  const logout = useCallback(async () => {
    try { await http.post('/api/v1/auth/logout'); } catch { /* sin red: igual se limpia localmente */ }
    setAccessToken(null);
    setUser(null);
  }, []);

  const can = useCallback((perm: string) => !!user?.permissions.includes(perm), [user]);

  return <Ctx.Provider value={{ user, ready, login, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
