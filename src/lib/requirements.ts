// Requerimientos (RQ): tipos, catálogos, consultas del tablero y de la ficha, y utilidades de fechas de vencimiento.
// El servidor omite tarifas y bandas salariales a quien no tiene rq.rates.read (canSeeRates = false).
import { useQuery } from '@tanstack/react-query';
import { cachedGet, type I18nLabel, type MasterItem } from './talents';
import { http } from './api';

export const RQ_API = '/api/v1/tenant/requirements';
export const RQ_TABLES = 'RQ_STATUS,RQ_PROFILE,TIME_UNIT,WORK_MODALITY,CONTRACT_MODALITY,CANDIDATE_STAGE,CURRENCY,TECH_SKILL,ACADEMIC_GRADE,CLIENT';

export type RQStatus = { id: string; code: string; label: I18nLabel; group: 'OPEN' | 'CLOSED' };
export type RQCard = {
  id: string; code: string; title: string; version: number; boardOrder: number; requestDate: string; dueDate: string; updatedAt: string;
  client: { id: string; label: I18nLabel }; status: RQStatus; modality?: { code: string; label: I18nLabel } | null;
  ownerId?: string; ownerName?: string; vacancies: number; covered: number; candidates: number;
  profiles: { label: I18nLabel; total: number; covered: number }[] | null;
};
export type RQVacancy = {
  id: string; profileId: string; profile: I18nLabel; quantity: number; rateInitial?: number | null; rateFinal?: number | null; covered: number;
  skills: { skillId: string; label: I18nLabel; years?: number | null; optional: boolean }[];
  careers: { career: string; gradeId?: string | null; grade?: I18nLabel | null; optional: boolean }[];
};
export type RQBilling = {
  contractId: string; contractLabel?: I18nLabel; group?: 'PAYROLL' | 'RXH'; currencyId: string; currencyCode?: string;
  baseMin?: number | null; baseMax?: number | null; mobilityMin?: number | null; mobilityMax?: number | null;
  monthlyMin?: number | null; monthlyMax?: number | null; quarterlyMin?: number | null; quarterlyMax?: number | null;
  semiannualMin?: number | null; semiannualMax?: number | null;
};
export type RQContact = { id: string; firstName: string; lastName: string; secondLastName?: string | null; position?: string | null; email?: string | null; phone?: string | null; phone2?: string | null; email2?: string | null };
export type RQCandidate = {
  id: string; vacancyId: string; boardOrder: number; notes?: string | null; updatedAt: string;
  stage: { id: string; code: string; label: I18nLabel };
  talent: { id: string; firstName: string; lastName: string; secondLastName?: string | null; headline?: string | null; photoId?: string | null; status: string; blacklisted: boolean };
};
export type RQDetail = {
  id: string; code: string; title: string; description?: string | null; version: number; requestDate: string; dueDate: string;
  closed: boolean; canSeeRates: boolean; createdAt: string; updatedAt?: string | null;
  client: { id: string; label: I18nLabel; ruc?: string | null; address?: string | null }; status: RQStatus;
  durationValue?: number | null; durationUnitId?: string | null; contractValue?: number | null; contractUnitId?: string | null;
  workModalityId?: string | null; needsEmo: boolean; needsSctr: boolean; needsLaptop: boolean; ownerId?: string | null; ownerName?: string;
  contacts: RQContact[]; billing: RQBilling[] | null; vacancies: RQVacancy[]; candidates: RQCandidate[];
};
export type RQApplication = {
  candidateId: string; requirementId: string; code: string; title: string; dueDate: string; client: I18nLabel; profile: I18nLabel;
  status: { code: string; label: I18nLabel; group: string }; stage: { code: string; label: I18nLabel }; addedAt: string;
};
export type BoardFilters = { search: string; clientId: string; mine: boolean };

/** Catálogos del módulo (estados, perfiles, unidades, modalidades, etapas, monedas, skills, grados, clientes). */
export function useRqCatalogs() {
  const q = useQuery({
    queryKey: ['masters', RQ_TABLES],
    queryFn: () => cachedGet<MasterItem[]>(`/api/v1/masters/items?tables=${RQ_TABLES}`),
    staleTime: 5 * 60_000,
  });
  const byTable = (table: string) => (q.data ?? []).filter((i) => i.table === table).sort((a, b) => a.sortOrder - b.sortOrder);
  const byCode = (table: string, code: string) => byTable(table).find((i) => i.code === code);
  return { ...q, byTable, byCode };
}

export const useBoard = (f: BoardFilters) => useQuery({
  queryKey: ['rq-board', f],
  queryFn: () => http.post<RQCard[]>(`${RQ_API}/board`, { search: f.search.trim(), clientId: f.clientId, mine: f.mine }),
  placeholderData: (prev) => prev,
  refetchInterval: 60_000,
});

export const useRequirement = (id?: string) => useQuery({
  queryKey: ['rq', id], enabled: !!id,
  queryFn: () => http.get<RQDetail>(`${RQ_API}/${id}`),
});

export type DueLevel = 'overdue' | 'today' | 'soon' | null;

/** Días hasta el vencimiento (negativo = vencido) en la fecha local. */
export function daysToDue(due: string, now = new Date()) {
  const [y, m, d] = due.slice(0, 10).split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}

/** Alerta de vencimiento de un RQ abierto: vencido, vence hoy o en los próximos 3 días. */
export function dueLevel(card: { dueDate: string; status: { group: string } }, now = new Date()): DueLevel {
  if (card.status.group === 'CLOSED') return null;
  const d = daysToDue(card.dueDate, now);
  return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= 3 ? 'soon' : null;
}

export const fullTalentName = (t: { firstName: string; lastName: string; secondLastName?: string | null }) =>
  [t.firstName, t.lastName, t.secondLastName].filter(Boolean).join(' ');
