// Tipos y helpers del módulo de talentos (catálogos, consultas con caché offline).
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, API_URL, getAccessToken, http, refreshSession } from './api';
import { offlineCache } from './offline';

export type I18nLabel = Record<string, string>;

export interface MasterItem { id: string; table: string; code: string; label: I18nLabel; sortOrder: number; isTenantOwned: boolean }
export interface SkillRef { id: string; label: I18nLabel; years?: number }

export interface TalentSummary {
  id: string; firstName: string; lastName: string; secondLastName?: string; headline?: string;
  country?: I18nLabel; city?: string; avgRating?: number; photoId?: string; yearsExperience: number;
  isFavorite: boolean; skills: SkillRef[]; englishLevel?: string; version: number; updatedAt: string; isBlacklisted?: boolean;
}

export interface Rates {
  modalityId?: string; payrollMin?: number; payrollMax?: number; payrollCurrencyId?: string;
  rxhMin?: number; rxhMax?: number; rxhCurrencyId?: string; notes?: string;
}

export interface Talent {
  id: string; firstName: string; lastName: string; secondLastName?: string; headline?: string;
  docTypeId?: string; docNumber?: string; email?: string; phone?: string; countryId?: string; country?: I18nLabel;
  city?: string; linkedinUrl?: string; githubUrl?: string; summary?: string; availability?: string; hasEquipment?: boolean;
  rates?: Rates; canSeeRates: boolean; photoId?: string; cvId?: string; avgRating?: number; status: string; source: string;
  version: number; createdAt: string; updatedAt: string;
  techSkills: { id: string; skillId: string; label: I18nLabel; years: number }[];
  softSkills: { id: string; skillId: string; label: I18nLabel }[];
  experiences: { id: string; company: string; position: string; startDate: string; endDate?: string; isCurrent: boolean; functions?: string; months: number }[];
  educations: { id: string; institution: string; career: string; gradeId?: string; grade?: I18nLabel; startDate?: string; endDate?: string; isCurrent: boolean; datePrecision: string }[];
  languages: { id: string; languageId: string; language: I18nLabel; levelId: string; level: I18nLabel; levelCode: string; stars: number }[];
  feedback: { id: string; stars: number; comment: string; authorId: string; authorName: string; createdAt: string; isMine: boolean; canDelete: boolean }[];
  files: { id: string; category: string; name: string; mimeType: string; size: number; createdAt: string }[];
  collections: string[];
}

export interface Collection {
  id: string; name: string; talentCount: number; access: 'OWNER' | 'EDIT' | 'VIEW';
  ownerId: string; ownerName: string; shareCount: number; updatedAt: string;
}

export const TALENT_API = '/api/v1/tenant/talents';

/** GET con respaldo en IndexedDB: si no hay red, devuelve la última respuesta guardada. */
export async function cachedGet<T>(path: string): Promise<T> {
  try {
    const data = await http.get<T>(path);
    offlineCache.set(`get:${path}`, data);
    return data;
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'OFFLINE')) {
      const cached = await offlineCache.get<T>(`get:${path}`);
      if (cached !== undefined) return cached;
    }
    throw e;
  }
}

const MASTER_TABLES = 'LANGUAGE,LANGUAGE_LEVEL,TECH_SKILL,SOFT_SKILL,COUNTRY,DOC_IDENTITY_TYPE,ACADEMIC_GRADE,CURRENCY,BILLING_MODALITY,DOCUMENT_TYPE';

export function useMasters() {
  const q = useQuery({
    queryKey: ['masters', MASTER_TABLES],
    queryFn: () => cachedGet<MasterItem[]>(`/api/v1/masters/items?tables=${MASTER_TABLES}`),
    staleTime: 5 * 60_000,
  });
  const byTable = (table: string) => (q.data ?? []).filter((i) => i.table === table);
  return { ...q, byTable };
}

export function useLabel() {
  const { i18n } = useTranslation();
  return (l?: I18nLabel | null) => (l ? l[i18n.language] ?? l.es ?? Object.values(l)[0] ?? '' : '');
}

export function fullName(t: { firstName: string; lastName: string; secondLastName?: string }) {
  return [t.firstName, t.lastName, t.secondLastName].filter(Boolean).join(' ');
}

/** Descarga un archivo protegido (requiere token) y lo devuelve como blob. */
export async function fetchFileBlob(fileId: string, inline = false): Promise<Blob> {
  const doFetch = () => fetch(`${API_URL}${TALENT_API}/files/${fileId}${inline ? '?inline=1' : ''}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, credentials: 'include',
  });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) res = await doFetch();
  if (!res.ok) throw new ApiError('NOT_FOUND', res.status);
  return res.blob();
}

export function yearsLabel(months: number, t: (k: string, o?: Record<string, unknown>) => string) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? t('talents.years', { count: y }) : '', m ? t('talents.months', { count: m }) : ''].filter(Boolean).join(' ') || t('talents.months', { count: 0 });
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST con respaldo en IndexedDB. Se usa para la búsqueda: los criterios viajan en el cuerpo
 * (no en la URL) y la clave de caché es un hash, así los términos no quedan legibles en el navegador.
 */
export async function cachedPost<T>(path: string, body: unknown): Promise<T> {
  const key = `post:${path}:${await sha256(JSON.stringify(body))}`;
  try {
    const data = await http.post<T>(path, body);
    offlineCache.set(key, data);
    return data;
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'OFFLINE')) {
      const cached = await offlineCache.get<T>(key);
      if (cached !== undefined) return cached;
    }
    throw e;
  }
}

export interface TalentFilters {
  search: string; skills: string[]; englishLevel: string; minYears: string; position: string;
  education: string; gradeId: string; collectionId: string; status: string; page: number;
}

export const EMPTY_FILTERS: TalentFilters = {
  search: '', skills: [], englishLevel: '', minYears: '', position: '', education: '', gradeId: '', collectionId: '', status: '', page: 1,
};
