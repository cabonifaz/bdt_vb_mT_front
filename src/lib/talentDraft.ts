// Borrador de un talento (alta o edición) y los pasos para guardarlo. Lo usan el editor completo y la carga rápida con CV.
// Cada elemento tiene uuid propio => guardar es idempotente (reintentos y cola offline no duplican).
import type { TFunction } from 'i18next';
import { ApiError, http } from './api';
import { TALENT_API, type MasterItem, type Rates, type Talent } from './talents';
import type { CvRead } from './cv/readCv';

export type Main = {
  firstName: string; lastName: string; secondLastName: string; headline: string; docTypeId: string; docNumber: string;
  email: string; phone: string; birthDate: string; countryId: string; city: string; originCountryId: string; originCity: string; linkedinUrl: string; githubUrl: string; summary: string;
  availabilityId: string; hasEquipment: '' | 'yes' | 'no';
};
export type Tech = { id: string; skillId?: string; label: string; years: number };
export type Soft = { id: string; skillId?: string; label: string };
export type Exp = { id: string; company: string; position: string; startDate: string; endDate: string; isCurrent: boolean; functions: string };
export type Edu = { id: string; institution: string; career: string; gradeId: string; startDate: string; endDate: string; isCurrent: boolean; datePrecision: string };
export type Lang = { id: string; languageId: string; levelId: string; stars: number };
export type NewFile = { id: string; category: string; file: File };
export type Draft = { main: Main; rates: Rates; tech: Tech[]; soft: Soft[]; exp: Exp[]; edu: Edu[]; lang: Lang[]; feedback: { stars: number; comment: string }; files: NewFile[] };
export type SaveStep = { key: string; label: string; run: () => Promise<unknown>; online?: boolean };

export const uid = () => crypto.randomUUID();
const nz = (s: string) => (s.trim() === '' ? null : s.trim());
const num = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : Number(v));

export function fromTalent(t?: Talent, label?: (l?: Record<string, string>) => string): Draft {
  const L = label ?? ((l?: Record<string, string>) => l?.es ?? '');
  return {
    main: {
      firstName: t?.firstName ?? '', lastName: t?.lastName ?? '', secondLastName: t?.secondLastName ?? '', headline: t?.headline ?? '',
      docTypeId: t?.docTypeId ?? '', docNumber: t?.docNumber ?? '', email: t?.email ?? '', phone: t?.phone ?? '', birthDate: t?.birthDate ?? '',
      countryId: t?.countryId ?? '', city: t?.city ?? '', originCountryId: t?.originCountryId ?? '', originCity: t?.originCity ?? '', linkedinUrl: t?.linkedinUrl ?? '', githubUrl: t?.githubUrl ?? '',
      summary: t?.summary ?? '', availabilityId: t?.availabilityId ?? '',
      hasEquipment: t?.hasEquipment === undefined || t?.hasEquipment === null ? '' : t.hasEquipment ? 'yes' : 'no',
    },
    rates: t?.rates ?? {},
    tech: (t?.techSkills ?? []).map((s) => ({ id: s.id, skillId: s.skillId, label: L(s.label), years: s.years })),
    soft: (t?.softSkills ?? []).map((s) => ({ id: s.id, skillId: s.skillId, label: L(s.label) })),
    exp: (t?.experiences ?? []).map((e) => ({ id: e.id, company: e.company, position: e.position, startDate: e.startDate, endDate: e.endDate ?? '', isCurrent: e.isCurrent, functions: e.functions ?? '' })),
    edu: (t?.educations ?? []).map((e) => ({ id: e.id, institution: e.institution, career: e.career, gradeId: e.gradeId ?? '', startDate: e.startDate ?? '', endDate: e.endDate ?? '', isCurrent: e.isCurrent, datePrecision: e.datePrecision })),
    lang: (t?.languages ?? []).map((l) => ({ id: l.id, languageId: l.languageId, levelId: l.levelId, stars: l.stars })),
    feedback: { stars: 0, comment: '' },
    files: [],
  };
}

/** Pasos para guardar el borrador: datos principales, eliminaciones, secciones nuevas o cambiadas, comentario y archivos. */
export function buildSaveSteps({ d, original, talentId, talent, canRates, t }: {
  d: Draft; original: Draft; talentId: string; talent?: Talent; canRates: boolean; t: TFunction;
}): SaveStep[] {
  const editing = !!talent;
  const steps: SaveStep[] = [];
  const m = d.main;
  const body: Record<string, unknown> = {
    id: talentId, firstName: m.firstName.trim(), lastName: m.lastName.trim(), secondLastName: nz(m.secondLastName), headline: nz(m.headline),
    docTypeId: nz(m.docTypeId), docNumber: m.docNumber.trim(), email: m.email.trim(), phone: m.phone.trim(), birthDate: m.birthDate, countryId: nz(m.countryId),
    city: nz(m.city), originCountryId: nz(m.originCountryId), originCity: nz(m.originCity), linkedinUrl: nz(m.linkedinUrl), githubUrl: nz(m.githubUrl), summary: nz(m.summary), availabilityId: nz(m.availabilityId),
    hasEquipment: m.hasEquipment === '' ? null : m.hasEquipment === 'yes',
  };
  if (editing) body.expectedVersion = talent!.version;
  if (canRates) body.rates = { modalityId: d.rates.modalityId || undefined, payrollMin: num(d.rates.payrollMin), payrollMax: num(d.rates.payrollMax),
    payrollCurrencyId: d.rates.payrollCurrencyId || undefined, rxhMin: num(d.rates.rxhMin), rxhMax: num(d.rates.rxhMax),
    rxhCurrencyId: d.rates.rxhCurrencyId || undefined, notes: d.rates.notes || undefined };
  steps.push({ key: 'main', label: t('talents.personal'), run: () => editing ? http.put(`${TALENT_API}/${talentId}`, body, true) : http.post(TALENT_API, body, true) });
  // eliminaciones (solo edición)
  const removed = <T extends { id: string }>(orig: T[], cur: T[]) => orig.filter((o) => !cur.some((c) => c.id === o.id));
  const changed = <T extends { id: string }>(orig: T[], cur: T[]) => cur.filter((c) => JSON.stringify(orig.find((o) => o.id === c.id)) !== JSON.stringify(c));
  for (const [sec, o, c] of [['tech-skills', original.tech, d.tech], ['soft-skills', original.soft, d.soft], ['experiences', original.exp, d.exp],
    ['educations', original.edu, d.edu], ['languages', original.lang, d.lang]] as [string, { id: string }[], { id: string }[]][]) {
    removed(o, c).forEach((x) => steps.push({ key: `del:${x.id}`, label: t('talents.delete'), run: () => http.del(`${TALENT_API}/sections/${sec}/${x.id}`) }));
  }
  changed(original.tech, d.tech).forEach((s) => steps.push({ key: `tech:${s.id}:${s.years}`, label: s.label,
    run: () => http.put(`${TALENT_API}/${talentId}/tech-skills`, s.skillId ? { id: s.id, skillId: s.skillId, years: s.years } : { id: s.id, label: s.label, years: s.years }, true) }));
  changed(original.soft, d.soft).forEach((s) => steps.push({ key: `soft:${s.id}`, label: s.label,
    run: () => http.post(`${TALENT_API}/${talentId}/soft-skills`, s.skillId ? { id: s.id, skillId: s.skillId } : { id: s.id, label: s.label }, true) }));
  changed(original.exp, d.exp).forEach((e) => steps.push({ key: `exp:${JSON.stringify(e)}`, label: e.position,
    run: () => http.put(`${TALENT_API}/${talentId}/experiences`, { ...e, endDate: e.isCurrent ? null : e.endDate || null, functions: e.functions || null }, true) }));
  changed(original.edu, d.edu).forEach((e) => steps.push({ key: `edu:${JSON.stringify(e)}`, label: e.career,
    run: () => http.put(`${TALENT_API}/${talentId}/educations`, { ...e, gradeId: e.gradeId || null, startDate: e.startDate || null, endDate: e.isCurrent ? null : e.endDate || null }, true) }));
  changed(original.lang, d.lang).forEach((l) => steps.push({ key: `lang:${JSON.stringify(l)}`, label: t('talents.language'),
    run: () => http.put(`${TALENT_API}/${talentId}/languages`, l, true) }));
  if (d.feedback.stars > 0 && d.feedback.comment.trim()) {
    steps.push({ key: `fb:${d.feedback.stars}:${d.feedback.comment}`, label: t('talents.feedback'), run: () => http.put(`${TALENT_API}/${talentId}/feedback`, { id: uid(), ...d.feedback }, true) });
  }
  d.files.forEach((f) => steps.push({ key: `file:${f.id}`, label: f.file.name, online: true, run: () => {
    const fd = new FormData();
    fd.append('file', f.file);
    return http.post(`${TALENT_API}/${talentId}/files?category=${f.category}`, fd);
  } }));
  return steps;
}

const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const labels = (x: MasterItem) => Object.values(x.label ?? {}).map(norm);
const byCode = (list: MasterItem[], code?: string) => (code ? list.find((x) => x.code?.toUpperCase() === code.toUpperCase()) : undefined);
const byLabel = (list: MasterItem[], name?: string) => (name ? list.find((x) => labels(x).includes(norm(name))) : undefined);

/** Resumen de lo leído (para avisar qué se guardará además de lo que se revisa). */
export type CvApplied = { exp: number; edu: number; tech: number; techUpdated: number; soft: number; lang: number; missing: string[] };

/**
 * Vuelca un CV leído con IA sobre el borrador (alta o edición): completa los datos vacíos (no pisa lo que ya hay),
 * agrega experiencias, estudios, habilidades e idiomas que no estén, actualiza los años de las habilidades técnicas
 * que ya tenía y adjunta el PDF como CV original (al guardarse pasa a ser el CV vigente; el anterior queda en archivos).
 */
export function applyCvRead(d: Draft, r: CvRead, items: MasterItem[], label: (l?: Record<string, string>) => string, file?: File): { draft: Draft; applied: CvApplied } {
  const masters = { byTable: (table: string) => items.filter((i) => i.table === table) };
  const m = { ...d.main };
  const fill = (k: keyof Main, v?: string) => { if (v && !String(m[k]).trim()) (m[k] as string) = v; };
  const countries = masters.byTable('COUNTRY');
  const country = byCode(countries, r.countryCode);
  const dni = masters.byTable('DOC_IDENTITY_TYPE').find((x) => x.code === 'DNI');
  fill('firstName', r.firstName); fill('lastName', r.lastName); fill('secondLastName', r.secondLastName);
  fill('email', r.email); fill('city', r.city); fill('linkedinUrl', r.linkedin); fill('githubUrl', r.github);
  fill('headline', r.headline); fill('summary', r.summary);
  fill('phone', r.phoneNumber ? (r.phoneCode ? `+${r.phoneCode} ${r.phoneNumber}` : r.phoneNumber) : '');
  if (country) fill('countryId', country.id);
  if (r.docNumber && !m.docNumber.trim()) {
    m.docNumber = r.docNumber;
    if (!m.docTypeId && dni && /^\d{8}$/.test(r.docNumber)) m.docTypeId = dni.id;
  }

  const techOpts = masters.byTable('TECH_SKILL');
  // habilidad que ya tenía el talento: el CV (más reciente) actualiza sus años solo si los trae o los pudo calcular
  // (el mínimo por defecto de 1 año no pisa lo que ya estaba)
  const tech = [...d.tech];
  let techUpdated = 0;
  for (const s of r.techSkills) {
    const match = byLabel(techOpts, s.name);
    const i = tech.findIndex((x) => (match && x.skillId === match.id) || norm(x.label) === norm(s.name));
    if (i < 0) tech.push({ id: uid(), skillId: match?.id, label: match ? label(match.label) : s.name, years: s.years });
    else if (s.yearsKnown && tech[i].years !== s.years) { tech[i] = { ...tech[i], years: s.years }; techUpdated++; }
  }
  const softOpts = masters.byTable('SOFT_SKILL');
  const soft = [...d.soft];
  for (const name of r.softSkills) {
    const match = byLabel(softOpts, name);
    if (soft.some((x) => (match && x.skillId === match.id) || norm(x.label) === norm(name))) continue;
    soft.push({ id: uid(), skillId: match?.id, label: match ? label(match.label) : name });
  }
  // experiencias sin fecha de inicio no se pueden guardar: se omiten (el usuario las ve en el CV adjunto)
  const exp = [...d.exp];
  for (const e of r.experiences) {
    if (!e.startDate || !e.position || exp.some((x) => norm(x.company) === norm(e.company) && x.startDate === e.startDate)) continue;
    if (!e.current && !e.endDate) continue;
    exp.push({ id: uid(), company: e.company, position: e.position, startDate: e.startDate, endDate: e.current ? '' : e.endDate, isCurrent: e.current, functions: e.functions });
  }
  const grades = masters.byTable('ACADEMIC_GRADE');
  const edu = [...d.edu];
  for (const e of r.educations) {
    const career = e.career || e.institution;
    if (edu.some((x) => norm(x.institution) === norm(e.institution) && norm(x.career) === norm(career))) continue;
    edu.push({ id: uid(), institution: e.institution, career, gradeId: byCode(grades, e.grade)?.id ?? '', startDate: e.startDate,
      endDate: e.current ? '' : e.endDate, isCurrent: e.current, datePrecision: e.yearOnly ? 'YEAR' : 'MONTH' });
  }
  const langs = masters.byTable('LANGUAGE');
  const levels = masters.byTable('LANGUAGE_LEVEL');
  const lang = [...d.lang];
  for (const l of r.languages) {
    const lg = byCode(langs, l.code) ?? byLabel(langs, l.name);
    const lv = byCode(levels, l.level);
    if (!lg || !lv || lang.some((x) => x.languageId === lg.id)) continue;
    lang.push({ id: uid(), languageId: lg.id, levelId: lv.id, stars: lv.sortOrder });
  }
  const files = file && !d.files.some((f) => f.category === 'CV') ? [...d.files, { id: uid(), category: 'CV', file }] : d.files;

  const missing = (['firstName', 'lastName', 'email', 'phone'] as const).filter((k) => !m[k].trim());
  return {
    draft: { ...d, main: m, tech, soft, exp, edu, lang, files },
    applied: { exp: exp.length - d.exp.length, edu: edu.length - d.edu.length, tech: tech.length - d.tech.length, techUpdated, soft: soft.length - d.soft.length, lang: lang.length - d.lang.length, missing },
  };
}

/** Talento existente con el mismo correo, documento o nombre completo (para no crear repetidos). */
export type TalentMatch = { id: string; firstName: string; lastName: string; secondLastName?: string; headline?: string; matchedBy: 'EMAIL' | 'DOC' | 'NAME' };
export type MatchQuery = { email?: string; docNumber?: string; firstName?: string; lastName?: string; secondLastName?: string };

/** byName = false: solo correo y documento (el usuario ya indicó que es otra persona con el mismo nombre). */
export async function findTalentMatch(q: MatchQuery, byName = true): Promise<TalentMatch | null> {
  const body: MatchQuery = { email: q.email ?? '', docNumber: q.docNumber ?? '' };
  if (byName) Object.assign(body, { firstName: q.firstName ?? '', lastName: q.lastName ?? '', secondLastName: q.secondLastName ?? '' });
  return (await http.post<{ match: TalentMatch | null }>(`${TALENT_API}/match`, body)).match;
}

/**
 * Funde un borrador nuevo sobre el de un talento existente: completa los datos vacíos y agrega lo que no esté
 * (habilidades, experiencias por empresa e inicio, estudios por institución y carrera, idiomas, archivos).
 */
export function mergeDrafts(base: Draft, extra: Draft): Draft {
  const main = { ...base.main };
  for (const k of Object.keys(main) as (keyof Main)[]) {
    if (!String(main[k]).trim() && String(extra.main[k]).trim()) (main[k] as string) = extra.main[k];
  }
  const add = <T,>(list: T[], more: T[], key: (x: T) => string) => [...list, ...more.filter((m) => !list.some((x) => key(x) === key(m)))];
  return {
    ...base, main,
    tech: add(base.tech, extra.tech, (x) => x.skillId ?? norm(x.label)),
    soft: add(base.soft, extra.soft, (x) => x.skillId ?? norm(x.label)),
    exp: add(base.exp, extra.exp, (x) => `${norm(x.company)}|${x.startDate}`),
    edu: add(base.edu, extra.edu, (x) => `${norm(x.institution)}|${norm(x.career)}`),
    lang: add(base.lang, extra.lang, (x) => x.languageId),
    files: add(base.files, extra.files, (x) => x.id),
  };
}

/** Ejecuta los pasos de guardado en orden. Devuelve los errores, o null si fallaron los datos principales (no hay talento). */
export async function runSaveSteps(steps: SaveStep[], onProgress: (current: number, total: number) => void, errText: (e: unknown) => string) {
  const errs: string[] = [];
  let i = 0;
  for (const s of steps) {
    onProgress(++i, steps.length);
    try {
      await s.run();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OFFLINE' && !s.online) continue;
      if (s.key === 'main') return { errs: [errText(e)], failedMain: true };
      errs.push(`${s.label}: ${errText(e)}`);
    }
  }
  return { errs, failedMain: false };
}
