// Indicadores de selección (jefe de selección y administrador): un documento por período, agrupado por semanas o meses.
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { http } from './api';
import { todayISO } from './modules';
import type { I18nLabel } from './talents';

export type Grain = 'WEEK' | 'MONTH';
export type DashFilters = { from: string; to: string; grain: Grain; clientId: string };
export type PeriodPoint = { period: string; hires: number; meetings: number; created: number; closed: number };
export type DashAnalyst = {
  id: string; name: string; lead: boolean; hires: number; meetings: number; meetingMinutes: number;
  series: { period: string; hires: number; meetings: number }[];
  openRqs: number; overdueRqs: number; staleRqs: number; inProcess: number;
};
export type SelectionDashboard = {
  from: string; to: string; grain: Grain; staleDays: number;
  hires: { hires: number; avgDaysToHire: number | null; talents: number };
  perHire: { hires: number; candidates: number; interviews: number; interviewMinutes: number; rqs: number };
  overdue: { openNoCandidates: number; openWithCandidates: number; openWithCandidatesNoHire: number; openTotal: number };
  closing: { closed: number; avgDaysToClose: number | null; late: number; onTime: number; vacancies: number; covered: number;
    success: number; successAvgCandidates: number | null; successAvgDays: number | null };
  closeReasons: { code: string; label: I18nLabel; count: number; avgDays: number | null; avgCandidates: number | null }[];
  speed: { created: number; withCandidates: number; avgDaysToFirstCandidate: number | null };
  analysts: DashAnalyst[];
  series: PeriodPoint[];
  funnel: { added: number; dataComplete: number; interview: number; confirmed: number; resigned: number; removed: number };
  multiProcess: { talents: number; multi: number; multiHired: number; single: number; singleHired: number; concurrent: number; avgProcesses: number | null };
  multiTop: { id: string; firstName: string; lastName: string; secondLastName?: string | null; processes: number; active: number; hired: boolean }[];
  clients: { id: string; label: I18nLabel; rqs: number; open: number; attended: number; lostOrCancelled: number; overdue: number;
    vacancies: number; covered: number; avgDaysToClose: number | null }[];
  profiles: { id: string; label: I18nLabel; hires: number; avgDaysToHire: number | null; candidatesPerHire: number | null }[];
  quality: { resignations: number; reopens: number; reopensMoreVacancies: number; staleNow: number };
};

export const useSelectionDashboard = (f: DashFilters) => useQuery({
  queryKey: ['dash-selection', f], placeholderData: keepPreviousData, staleTime: 60_000,
  queryFn: () => http.post<SelectionDashboard>('/api/v1/tenant/dashboard/selection',
    { from: f.from, to: f.to, grain: f.grain, clientId: f.clientId || undefined, today: todayISO() }),
});

const iso = (d: Date) => todayISO(d);
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/** Inicio de cada período (lunes o día 1) entre from y to, para completar los que no tienen datos. */
export function periods(from: string, to: string, grain: Grain): string[] {
  const end = parse(to);
  const d = parse(from);
  if (grain === 'WEEK') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else d.setDate(1);
  const out: string[] = [];
  while (d <= end && out.length < 120) {
    out.push(iso(d));
    if (grain === 'WEEK') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
  }
  return out;
}

/** Rango por defecto y atajos: últimas 12 semanas, 3, 6 o 12 meses, o el año en curso. */
export type Preset = '12W' | '3M' | '6M' | '12M' | 'YTD';
export function presetRange(p: Preset, today = new Date()): { from: string; to: string; grain: Grain } {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const to = iso(d);
  switch (p) {
    case '12W': d.setDate(d.getDate() - 7 * 12 + 1); return { from: iso(d), to, grain: 'WEEK' };
    case '3M': d.setMonth(d.getMonth() - 3); d.setDate(d.getDate() + 1); return { from: iso(d), to, grain: 'WEEK' };
    case '6M': d.setMonth(d.getMonth() - 6); d.setDate(1); return { from: iso(d), to, grain: 'MONTH' };
    case '12M': d.setMonth(d.getMonth() - 12); d.setDate(1); return { from: iso(d), to, grain: 'MONTH' };
    default: return { from: `${d.getFullYear()}-01-01`, to, grain: 'MONTH' };
  }
}

/** Promedio seguro (null si no hay base). */
export const ratio = (a: number, b: number, digits = 1) => (b > 0 ? Math.round((a / b) * 10 ** digits) / 10 ** digits : null);
