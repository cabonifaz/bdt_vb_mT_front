// Integración con IGDT (Ingreso y Gestión de Talentos): IGDT gobierna los catálogos compartidos. Sin integración el
// admin los administra en BDT; con integración activa son de solo lectura (useAuth().has('igdt_catalogs')).
import { useQuery } from '@tanstack/react-query';
import { http } from './api';
import type { I18nLabel } from './talents';

export type IgdtStatus = {
  connected: boolean; status: 'NONE' | 'ACTIVE' | 'DISABLED'; available: boolean; remoteTenant?: string | null;
  importedAt?: string | null; lastSyncAt?: string | null; lastError?: string | null; cursor: number;
  tables: { code: string; label: I18nLabel }[] | null; counts: { clients: number; contacts: number; tariffs: number };
};
export type SuggestedTariff = {
  id: string; rate: number; currency: string; rateType: { code: string; label: I18nLabel }; scope: 'GENERAL' | 'CLIENT';
  validFrom: string; validTo?: string | null;
};

const API = '/api/v1/tenant/integrations/igdt';
export const IGDT_KEY = ['igdt-status'];
export const useIgdtStatus = () => useQuery({ queryKey: IGDT_KEY, queryFn: () => http.get<IgdtStatus>(API) });
export const connectIgdt = (apiKey: string) => http.put<IgdtStatus>(API, { apiKey });
export const disconnectIgdt = () => http.del(API);
export const syncIgdt = () => http.post<IgdtStatus>(`${API}/sync`, {});

/** Tarifa sugerida del tarifario de IGDT (null si no hay una vigente). */
export async function suggestedTariff(profileId: string, clientId: string, date: string): Promise<SuggestedTariff | null> {
  const q = new URLSearchParams({ profileId, date, ...(clientId ? { clientId } : {}) });
  const r = await http.get<SuggestedTariff | undefined>(`/api/v1/tenant/catalog/tariff?${q}`);
  return r ?? null;
}
