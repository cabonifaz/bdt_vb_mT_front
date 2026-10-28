// Lectura de un CV con IA para autocompletar el alta de un talento: el texto del PDF se extrae en el navegador (pdf.js)
// y el backend lo estructura con OpenAI (POST /talents/cv/read). El consumo se cuenta por tenant.
import { http } from '../api';
import { TALENT_API } from '../talents';

export type CvRead = {
  firstName: string; lastName: string; secondLastName: string; docNumber: string; email: string; phoneCode: string; phoneNumber: string;
  countryCode: string; city: string; linkedin: string; github: string; headline: string; summary: string;
  techSkills: { name: string; years: number }[]; softSkills: string[];
  experiences: { company: string; position: string; functions: string; startDate: string; endDate: string; current: boolean }[];
  educations: { institution: string; career: string; grade: string; startDate: string; endDate: string; current: boolean; yearOnly: boolean }[];
  languages: { code: string; name: string; level: string }[];
};

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Texto del PDF en orden de lectura (por página, línea y columna). Máximo 15 páginas. */
export async function pdfText(file: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 15); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const lines = new Map<number, { x: number; s: string }[]>();
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 3) * 3; // misma línea aunque varíe un poco la base
        lines.set(y, [...(lines.get(y) ?? []), { x: it.transform[4], s: it.str }]);
      }
      pages.push([...lines.entries()].sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(' ')).join('\n'));
    }
    return pages.join('\n\n').replace(/[ \t]+/g, ' ').trim();
  } finally {
    void doc.destroy();
  }
}

/** Lee el CV (PDF) y devuelve sus datos estructurados. Un PDF escaneado sin texto responde CV_NO_TEXT. */
export async function readCv(file: File): Promise<CvRead> {
  const text = await pdfText(file);
  return http.post<CvRead>(`${TALENT_API}/cv/read`, { text });
}
