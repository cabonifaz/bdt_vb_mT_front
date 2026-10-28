// Adopta el formato de un CV de ejemplo (PDF) que sube el tenant: se analiza la primera página en el navegador.
// - Cabecera: la imagen/gráfico que hay sobre el primer texto se recorta a todo el ancho y se usa tal cual.
// - Pie: el texto del pie sin la fecha de generación (se pone la real al generar) y su recuadro de color, si tiene.
// - Nombre (el texto más grande): alineación y color. Títulos numerados ("1. Experiencia"): color y si llevan línea.
// - Tipografía (serif o sans) y si el puesto y las fechas van en negrita.
import type { CvStyle } from './CvDocument';

export type CvSample = { header?: Blob; footerText?: string; style: CvStyle };

type Item = { str: string; x: number; y: number; w: number; h: number; size: number; font: string };

const W = 1000; // ancho del render en px

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export async function analyzeCvSample(file: Blob): Promise<CvSample> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: W / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const H = canvas.height;
    const px = ctx.getImageData(0, 0, canvas.width, H).data;
    const at = (x: number, y: number) => { const i = (y * canvas.width + x) * 4; return [px[i], px[i + 1], px[i + 2]] as const; };
    const ink = (x: number, y: number) => { const [r, g, b] = at(x, y); return Math.min(r, g, b) < 235; };
    const rowInk = (y: number, x0 = 0, x1 = canvas.width) => { let n = 0; for (let x = x0; x < x1; x += 2) if (ink(x, y)) n++; return n / ((x1 - x0) / 2); };

    // textos de la página en px del render (y = borde superior)
    const content = await page.getTextContent();
    const styles = content.styles as Record<string, { fontFamily?: string }>;
    const items: Item[] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const [a, b, , , e, f] = pdfjs.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(a, b);
      let font = styles[it.fontName]?.fontFamily ?? '';
      try { font += ` ${(page.commonObjs.get(it.fontName) as { name?: string })?.name ?? ''}`; } catch { /* fuente sin cargar */ }
      items.push({ str: it.str.trim(), x: e, y: f - size, w: it.width * vp.scale, h: size, size, font });
    }
    items.sort((p, q) => p.y - q.y || p.x - q.x);

    const colorOf = (it: Item) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = Math.max(0, Math.floor(it.y)); y < Math.min(H, it.y + it.h); y++)
        for (let x = Math.max(0, Math.floor(it.x)); x < Math.min(canvas.width, it.x + it.w); x++) {
          const c = at(x, y);
          if (lum(...c) < 100) { r += c[0]; g += c[1]; b += c[2]; n++; }
        }
      return n ? hex(r / n, g / n, b / n) : undefined;
    };
    const bold = (it?: Item) => !!it && /bold|black|heavy|semibold/i.test(it.font);

    // cabecera: gráfico sobre el primer texto que no esté pegado al borde inferior
    let header: Blob | undefined;
    const firstText = items.find((it) => it.y < H * 0.85);
    const limit = Math.min(firstText ? Math.floor(firstText.y) - 2 : 0, Math.floor(H * 0.3));
    let last = -1;
    for (let y = 0; y < limit; y++) if (rowInk(y) > 0.01) last = y;
    if (last >= H * 0.02) {
      const h = last + 1;
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = h;
      c.getContext('2d')!.drawImage(canvas, 0, 0, canvas.width, h, 0, 0, canvas.width, h);
      header = await new Promise<Blob | undefined>((ok) => c.toBlob((b) => ok(b ?? undefined), 'image/png'));
    }

    // pie: textos en el 12% inferior, sin la fecha de generación ni el número de página
    const footItems = items.filter((it) => it.y > H * 0.88);
    const footLine = footItems.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    const footerText = footLine.split('|').map((p) => p.trim())
      .filter((p) => p && !/fecha|generated on|generation date|p[áa]gina|page\s*\d|^\d+(\s*(\/|de|of)\s*\d+)?$|\b(19|20)\d{2}-\d{2}-\d{2}\b|\d{1,2} de [a-záéíóú]+ de \d{4}/i.test(p))
      .join(' | ').slice(0, 300) || undefined;
    let footerBg: string | undefined;
    if (footItems.length) {
      const f = footItems[0];
      const y = Math.min(H - 1, Math.round(f.y + f.h / 2));
      const counts = new Map<string, number>();
      for (let x = 0; x < canvas.width; x += 2) {
        const c = at(x, y);
        const l = lum(...c);
        if (l > 160 && l < 250) { const k = hex(c[0], c[1], c[2]); counts.set(k, (counts.get(k) ?? 0) + 1); }
      }
      const top = [...counts.entries()].sort((p, q) => q[1] - p[1])[0];
      if (top && top[1] > canvas.width / 2 * 0.3) footerBg = top[0];
    }

    // nombre: el texto más grande de la parte superior
    const body = items.filter((it) => it.y < H * 0.88 && it.y > (header ? limit : 0));
    const name = body.filter((it) => it.y < H * 0.5).sort((p, q) => q.size - p.size)[0];
    const nameAlign: CvStyle['nameAlign'] = name && Math.abs(name.x + name.w / 2 - canvas.width / 2) < canvas.width * 0.06 ? 'center' : 'left';

    // títulos de sección numerados
    const sizes = body.map((it) => it.size).sort((p, q) => p - q);
    const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
    const headings = body.filter((it) => it !== name && /^\d+\.(\s|$)/.test(it.str) && it.size > median * 1.05);
    const heading = headings[0];
    let headingRule = false;
    if (heading) {
      for (let y = Math.ceil(heading.y + heading.h); y < Math.min(H, heading.y + heading.h * 1.9); y++)
        if (rowInk(y, Math.floor(heading.x), Math.floor(canvas.width - heading.x)) > 0.6) { headingRule = true; break; }
    }
    // el resumen lleva título si entre el nombre y el primer título numerado hay otro texto del tamaño de un título
    const summaryHeading = !!name && !!heading && body.some((it) => it.y > name.y + name.h && it.y < heading.y && it.size >= heading.size * 0.95);
    const dates = body.find((it) => /\b(19|20)\d{2}\s*[-–]\s*(\w+\s*)?((19|20)\d{2}|actual|presente|present)/i.test(it.str));
    const serif = items.filter((it) => /serif/i.test(it.font) && !/sans/i.test(it.font)).length > items.length / 2;

    return {
      header,
      footerText,
      style: {
        nameAlign,
        nameColor: name ? colorOf(name) : undefined,
        headingColor: heading ? colorOf(heading) : undefined,
        headingRule,
        summaryHeading,
        boldPositions: bold(dates),
        footerBg,
        font: serif ? 'Times-Roman' : 'Helvetica',
      },
    };
  } finally {
    void doc.destroy();
  }
}
