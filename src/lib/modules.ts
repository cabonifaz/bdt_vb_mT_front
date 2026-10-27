// Tipos y catálogos de clientes, lista negra y entrevistas.
import { useQuery } from '@tanstack/react-query';
import { cachedGet, type I18nLabel, type MasterItem } from './talents';

export interface ClientItem extends MasterItem { str1?: string; str2?: string; str3?: string; isActive: boolean }

export interface BlacklistEntry { id: string; clientId?: string; client?: I18nLabel; reason: string; changedAt: string; userName: string }
export interface BlacklistMovement { id: number; movement: 'CREATE' | 'UPDATE' | 'DELETE'; client?: I18nLabel; reason: string; createdAt: string; userName: string }
export interface BlacklistTalent { talentId: string; firstName: string; lastName: string; secondLastName?: string; headline?: string; lastChange: string; isGlobal: boolean; clientCount: number }

export interface InterviewSummary {
  id: string; talentId: string; firstName: string; lastName: string; secondLastName?: string;
  typeCode: 'VIRTUAL' | 'IN_PERSON' | 'PHONE'; type: I18nLabel; stageCode: string; stage: I18nLabel;
  statusCode: 'REGISTERED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'; status: I18nLabel; client?: I18nLabel;
  requirementRef?: string; profile: string; date: string; time: string; ratingGeneral: number;
}
export interface Interviewer { name: string; email?: string; notify: boolean }
export interface Recording { url: string; date: string }
export interface InterviewAnswer { questionId: string; question: I18nLabel; answer: string; active: boolean }
export interface Interview extends InterviewSummary {
  headline?: string; typeId: string; stageId: string; statusId: string; durationId?: string; durationMinutes?: number;
  clientId?: string; meetingLink?: string; locationUrl?: string; address?: string;
  ratingPersonal: number; ratingExperience: number; ratingLanguages: number; ratingEducation: number;
  notesPersonal?: string; notesExperience?: string; notesLanguages?: string; notesEducation?: string; cancelReason?: string;
  version: number; createdAt: string; updatedAt: string; talentBlacklisted: boolean;
  interviewers: Interviewer[]; recordings: Recording[]; answers: InterviewAnswer[];
  files: { id: string; category: string; name: string; mimeType: string; size: number; createdAt: string }[];
}

export const INTERVIEW_TABLES = 'INTERVIEW_TYPE,INTERVIEW_STAGE,INTERVIEW_STATUS,INTERVIEW_DURATION,INTERVIEW_FILE_TYPE,PHONE_QUESTION,CLIENT';

/** Catálogos de entrevistas + clientes del tenant (con caché offline). */
export function useInterviewCatalogs() {
  const q = useQuery({
    queryKey: ['masters', INTERVIEW_TABLES],
    queryFn: () => cachedGet<MasterItem[]>(`/api/v1/masters/items?tables=${INTERVIEW_TABLES}`),
    staleTime: 5 * 60_000,
  });
  const byTable = (table: string) => (q.data ?? []).filter((i) => i.table === table);
  const byCode = (table: string, code: string) => byTable(table).find((i) => i.code === code);
  return { ...q, byTable, byCode };
}

export const STATUS_TONE: Record<string, string> = { REGISTERED: 'info', IN_PROGRESS: 'warning', FINISHED: 'success', CANCELLED: 'danger' };

export const GOOGLE_MAPS_RE = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+\/maps)/i;

/** Hora actual redondeada al siguiente cuarto de hora (HH:mm). */
export function nextQuarter(d = new Date()) {
  const m = Math.ceil((d.getMinutes() + 1) / 15) * 15;
  const t = new Date(d);
  t.setMinutes(m, 0, 0);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
