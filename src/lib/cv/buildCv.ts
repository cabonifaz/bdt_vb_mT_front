// Arma los datos del CV desde la ficha del talento (y, en inglés, con los textos traducidos por el backend).
import { assetUrl, type Branding } from '../../providers/theme';
import { fetchFileBlob, fullName, type MasterItem, type Talent } from '../talents';
import type { CvData, CvLang, CvTemplate } from './CvDocument';

export type CvText = { headline: string; summary: string; experiences: { id: string; title: string; functions?: string }[]; educations: { id: string; title: string }[] };
type Label = Record<string, string> | undefined | null;

const pick = (l: Label, lang: CvLang) => (l ? l[lang] ?? l.es ?? Object.values(l)[0] ?? '' : '');

export function buildCvData(x: Talent, lang: CvLang, grades: MasterItem[], text?: CvText, photo?: string): CvData {
  const course = grades.find((g) => g.code === 'COURSE')?.id;
  const exp = new Map(text?.experiences.map((e) => [e.id, e]));
  const edu = new Map(text?.educations.map((e) => [e.id, e]));
  const educations = x.educations.map((e) => ({
    id: e.id, gradeId: e.gradeId, institution: e.institution, career: edu.get(e.id)?.title || e.career, grade: pick(e.grade, lang) || undefined,
    start: e.startDate, end: e.endDate, current: e.isCurrent, yearOnly: e.datePrecision === 'YEAR',
  }));
  return {
    name: fullName(x),
    headline: (text?.headline || x.headline) ?? undefined,
    summary: (text?.summary || x.summary) ?? undefined,
    location: [x.city, pick(x.country, lang)].filter(Boolean).join(', ') || undefined,
    photo,
    experiences: x.experiences.map((e) => ({
      company: e.company, position: exp.get(e.id)?.title || e.position, start: e.startDate, end: e.endDate, current: e.isCurrent,
      functions: (exp.get(e.id)?.functions || e.functions) ?? undefined,
    })),
    educations: educations.filter((e) => !course || e.gradeId !== course),
    certifications: educations.filter((e) => course && e.gradeId === course),
    tech: x.techSkills.map((t) => ({ name: pick(t.label, lang), years: t.years })),
    soft: x.softSkills.map((t) => pick(t.label, lang)),
    languages: x.languages.map((l) => ({ name: pick(l.language, lang), level: pick(l.level, lang) })),
  };
}

/** react-pdf solo lee PNG/JPG: toda imagen (logo webp, foto, cabecera) se normaliza a PNG en data URL. */
export async function toPngDataUrl(src: Blob | string): Promise<string | undefined> {
  return (await toPng(src))?.url;
}

async function toPng(src: Blob | string): Promise<{ url: string; w: number; h: number } | undefined> {
  try {
    const blob = typeof src === 'string' ? await (await fetch(src.startsWith('http') ? src : new URL(src, location.origin).href)).blob() : src;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    return { url: c.toDataURL('image/png'), w: bmp.width, h: bmp.height };
  } catch {
    return undefined; // sin imagen el CV se genera igual (banda con el nombre del tenant)
  }
}

export async function buildCvTemplate(b: Branding): Promise<CvTemplate> {
  const [header, footer, logo] = await Promise.all([
    b.cvHeaderUrl ? toPng(assetUrl(b.cvHeaderUrl)) : undefined,
    b.cvFooterUrl ? toPngDataUrl(assetUrl(b.cvFooterUrl)) : undefined,
    b.cvHeaderUrl || !(b.logoDarkUrl || b.logoUrl) ? undefined : toPngDataUrl(assetUrl(b.logoDarkUrl || b.logoUrl)),
  ]);
  // la cabecera ocupa todo el ancho de la página A4 (595pt) con su proporción real
  return { displayName: b.displayName, colorPrimary: b.colorPrimary, colorSecondary: b.colorSecondary,
    header: header?.url, headerH: header ? (595.28 * header.h) / header.w : undefined, footer, logo,
    footerText: b.cvFooterText, showPhoto: !!b.cvShowPhoto, style: b.cvStyle };
}

export async function talentPhoto(x: Talent) {
  return x.photoId ? toPngDataUrl(await fetchFileBlob(x.photoId, true)) : undefined;
}
