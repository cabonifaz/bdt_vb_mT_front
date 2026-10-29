// Documentos de postulación: maestro del tenant, documentos que pide cada RQ y los que presenta cada postulante,
// con su validación manual o automática (CUL contra el MTPE con el RUC del tenant).
import { useQuery } from '@tanstack/react-query';
import { http } from './api';
import type { I18nLabel } from './talents';
import { RQ_API } from './requirements';
import { todayISO } from './modules';

export type DocMode = 'REQUIRED' | 'OPTIONAL';
export type DocVerification = 'MANUAL' | 'AUTO_CUL';
/** Estado efectivo de un documento para un postulante (vencido y faltante los calcula el servidor). */
export type DocStatus = 'MISSING' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export type DocRule = {
  typeId: string; code: string; label: I18nLabel; defaultMode: DocMode; reusable: boolean; validityDays: number | null;
  verification: DocVerification; active: boolean; sortOrder: number;
};
export type RQDocument = { typeId: string; code: string; label: I18nLabel; mode: DocMode; reusable: boolean; validityDays: number | null; verification: DocVerification; sortOrder: number };
export type CandidateDocState = { typeId: string; mode: DocMode; status: DocStatus };

export type PresentedDoc = {
  id: string; fileId: string; fileName: string; status: Exclude<DocStatus, 'MISSING'>; method?: 'MANUAL' | 'AUTO' | null; reason?: string | null;
  issuedAt?: string | null; expiresAt?: string | null; createdAt: string; verifiedAt?: string | null; verifiedByName?: string;
  autoResult?: { code?: string; docNumber?: string; names?: string; vigente?: boolean; match?: boolean; issuedAt?: string; message?: string } | null;
  /** cargado en otra postulación (reutilizable) */
  fromOtherRq: boolean;
};
export type CandidateEvent = { type: 'ADDED' | 'STAGE' | 'DOC_UPLOADED' | 'DOC_VERIFIED' | 'DOC_REJECTED' | 'DOC_CHECK_FAILED' | 'RESIGNED'; data?: Record<string, unknown> | null; at: string; byName?: string };
export type CandidateDetail = {
  id: string; addedAt: string; updatedAt: string;
  requirement: { id: string; code: string; title: string; closed: boolean };
  stage: { id: string; code: string; label: I18nLabel }; vacancy: { id: string; profile: I18nLabel };
  resignation?: { at: string; offboard: 'PENDING' | 'EFFECTIVE'; offboardAt?: string | null } | null;
  talent: { id: string; firstName: string; lastName: string; secondLastName?: string | null; headline?: string | null; photoId?: string | null };
  documents: (RQDocument & { current: PresentedDoc | null })[];
  events: CandidateEvent[];
};
export type Verdict = { status: 'PENDING' | 'VERIFIED' | 'REJECTED'; method: string; reason: string };

export const DOC_RULES_API = '/api/v1/tenant/document-rules';
const CAND_API = `${RQ_API}/candidates`;

export const useDocRules = (enabled = true) => useQuery({
  queryKey: ['doc-rules'], enabled, staleTime: 60_000,
  queryFn: () => http.get<DocRule[]>(DOC_RULES_API),
});

export const useCandidateDetail = (id?: string) => useQuery({
  queryKey: ['rq-candidate', id], enabled: !!id,
  queryFn: () => http.post<CandidateDetail>(`${CAND_API}/${id}/detail`, { today: todayISO() }),
});

/** Marca de tiempo del servidor (UTC, "AAAA-MM-DD HH:MM:SS") en ISO con zona. */
export const utcISO = (s: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
/** Fecha sin hora (vencimiento, emisión): se muestra tal cual, sin correrla por la zona horaria. */
export const dayLabel = (d: string, locale: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

export const byOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

export async function uploadDocument(candidateId: string, typeId: string, file: File, cul?: CulQr | null) {
  const form = new FormData();
  form.append('file', file);
  form.append('typeId', typeId);
  form.append('today', todayISO());
  if (cul) { form.append('culCode', cul.code); form.append('culDoc', cul.docNumber); }
  return http.post<Verdict>(`${CAND_API}/${candidateId}/documents`, form);
}
export const verifyDocument = (candidateId: string, docId: string, approve: boolean, reason = '') =>
  http.post<void>(`${CAND_API}/${candidateId}/documents/${docId}/verify`, { approve, reason });
export const recheckDocument = (candidateId: string, docId: string, cul?: CulQr | null) =>
  http.post<Verdict>(`${CAND_API}/${candidateId}/documents/${docId}/recheck`, { culCode: cul?.code ?? '', culDoc: cul?.docNumber ?? '' });

/** Resumen para el kanban: obligatorios verificados, con problemas (rechazado o vencido) y pendientes de revisión. */
export function docSummary(docs: CandidateDocState[] | undefined) {
  const req = (docs ?? []).filter((d) => d.mode === 'REQUIRED');
  return {
    total: req.length,
    verified: req.filter((d) => d.status === 'VERIFIED').length,
    pending: req.filter((d) => d.status === 'PENDING').length,
    problems: req.filter((d) => d.status === 'REJECTED' || d.status === 'EXPIRED').length,
    missing: req.filter((d) => d.status === 'MISSING').length,
  };
}

// ---------------- CUL: lectura del QR en el navegador ----------------
export type CulQr = { code: string; docNumber: string };
const CUL_URL = /^https:\/\/www\.empleosperu\.gob\.pe\/CertificadoUnicoLaboral\/Verificacion\.html\?/i;

/** Datos del QR de un CUL (o, si no se puede leer, del texto del PDF). null si no parece un CUL. */
export async function readCulQr(file: File): Promise<CulQr | null> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(1);
    // QR: se dibuja la página al doble de tamaño y se busca el código
    const view = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = view.width; canvas.height = view.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport: view }).promise;
      const { default: jsQR } = await import('jsqr');
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(img.data, img.width, img.height);
      if (qr && CUL_URL.test(qr.data)) {
        const q = new URL(qr.data).searchParams;
        const code = q.get('cul') ?? '', docNumber = q.get('numdoc') ?? '';
        if (/^\d{11}$/.test(code)) return { code, docNumber };
      }
    }
    // respaldo: el texto del certificado
    const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
    if (!/CERTIFICADO\s+ÚNICO\s+LABORAL/i.test(text)) return null;
    const code = text.match(/\b(\d{11})\b/)?.[1] ?? '';
    const docNumber = text.match(/N°\s*de\s*documento\s*:?\s*([0-9A-Z]{8,12})/i)?.[1] ?? '';
    return code ? { code, docNumber } : null;
  } finally {
    void doc.destroy();
  }
}
