// CV del talento: con la marca del tenant en español o inglés (traducido con IA), o el CV original que se cargó.
// Los CV con marca se guardan en los archivos del talento al generarse y se reutilizan: abrir el modal no vuelve a
// generar ni a traducir (no consume tokens). "Regenerar" los crea de nuevo cuando cambió la información del talento.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { ApiError, http } from '../../lib/api';
import { fetchFileBlob, fullName, TALENT_API, useMasters, type Talent } from '../../lib/talents';
import { useTheme } from '../../providers/theme';
import { Button, Modal, useErrorText } from '../ui';
import { Loader } from '../ui/Loader';
import { buildCvData, buildCvTemplate, talentPhoto, type CvText } from '../../lib/cv/buildCv';

type Mode = 'es' | 'en' | 'original';
const MODES: Mode[] = ['es', 'en', 'original'];
const CATEGORY: Record<'es' | 'en', string> = { es: 'CV_TENANT_ES', en: 'CV_TENANT_EN' };
// margen para no marcar como desactualizado un CV solo porque guardarlo actualizó la ficha
const STALE_MS = 2 * 60_000;

type Doc = { mode: Mode; url: string; blob: Blob; pdf: boolean; savedAt?: string; stale?: boolean; unsaved?: boolean };

export function CvModal({ talent, onClose, onSaved, canSave }: { talent: Talent; onClose: () => void; onSaved: () => void; canSave: boolean }) {
  const { t, i18n } = useTranslation();
  const { branding } = useTheme();
  const masters = useMasters();
  const errText = useErrorText();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('es');
  const [run, setRun] = useState({ n: 0, force: false }); // "Regenerar" fuerza una nueva generación
  const [doc, setDoc] = useState<Doc | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // archivos vigentes del talento (se actualizan al guardar sin esperar a que se recargue la ficha)
  const files = useRef(talent.files);
  const name = fullName(talent);
  const original = talent.files.find((f) => f.category === 'CV') ?? talent.files.find((f) => f.id === talent.cvId);
  const fileName = (m: 'es' | 'en') => `${name.replace(/\s+/g, '_')}_CV_${m.toUpperCase()}.pdf`;

  useEffect(() => {
    let alive = true;
    let url = '';
    const show = (d: Omit<Doc, 'url'>) => { if (!alive) return; url = URL.createObjectURL(d.blob); setDoc({ ...d, url }); };
    (async () => {
      setError(''); setDoc(null);
      try {
        if (mode === 'original') {
          if (!original) { setError(t('cv.noOriginal')); return; }
          setBusy(t('cv.loadingOriginal'));
          const blob = await fetchFileBlob(original.id, true);
          show({ mode, blob, pdf: blob.type === 'application/pdf' });
          return;
        }
        const cat = CATEGORY[mode];
        const stored = files.current.filter((f) => f.category === cat).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (stored && !run.force) {
          setBusy(t('cv.loadingSaved'));
          const blob = await fetchFileBlob(stored.id, true);
          const stale = new Date(talent.updatedAt).getTime() - new Date(stored.createdAt).getTime() > STALE_MS;
          show({ mode, blob, pdf: true, savedAt: stored.createdAt, stale });
          return;
        }
        let text: CvText | undefined;
        if (mode === 'en') {
          setBusy(t('cv.translating'));
          text = await http.post<CvText>(`${TALENT_API}/${talent.id}/cv/translate`, { lang: 'en' });
        }
        setBusy(t('cv.generating'));
        const [{ pdf }, { CvDocument }, tpl, photo] = await Promise.all([
          import('@react-pdf/renderer'), import('../../lib/cv/CvDocument'), buildCvTemplate(branding!),
          branding?.cvShowPhoto ? talentPhoto(talent) : Promise.resolve(undefined),
        ]);
        const data = buildCvData(talent, mode, masters.byTable('ACADEMIC_GRADE'), text, photo);
        const blob = await pdf(<CvDocument data={data} tpl={tpl} lang={mode} generatedAt={new Date()} />).toBlob();
        if (!alive) return;
        // se guarda de inmediato (reemplaza el anterior del mismo idioma) para no volver a generarlo
        let savedAt: string | undefined;
        if (canSave) {
          setBusy(t('cv.saving'));
          try {
            const fd = new FormData();
            fd.append('file', new File([blob], fileName(mode), { type: 'application/pdf' }));
            const saved = await http.post<{ id: string; category: string; name: string; mimeType: string; size: number; createdAt: string }>(
              `${TALENT_API}/${talent.id}/files?category=${cat}`, fd);
            const old = files.current.filter((f) => f.category === cat);
            for (const o of old) await http.del(`${TALENT_API}/files/${o.id}`).catch(() => undefined);
            savedAt = saved?.createdAt ?? new Date().toISOString();
            files.current = [...files.current.filter((f) => f.category !== cat), { ...saved, category: cat, createdAt: savedAt }];
            // la ficha en caché ya conoce el CV guardado: reabrir el modal no lo vuelve a generar aunque no haya recargado
            qc.setQueryData<Talent>(['talent', talent.id], (cur) => (cur ? { ...cur, files: files.current } : cur));
            onSaved();
          } catch (e) {
            if (!(e instanceof ApiError && e.code === 'OFFLINE')) setError(errText(e));
          }
        }
        show({ mode, blob, pdf: true, savedAt, unsaved: !savedAt });
      } catch (e) {
        if (alive) setError(errText(e));
      } finally {
        if (alive) setBusy('');
      }
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de idioma o al regenerar
  }, [mode, run]);

  const downloadName = doc?.mode === 'original' ? original?.name ?? 'CV' : fileName((doc?.mode ?? 'es') as 'es' | 'en');
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const status = !doc || doc.mode === 'original' ? t('cv.hint.original')
    : doc.unsaved ? t('cv.notSaved')
    : doc.stale ? t('cv.stale', { date: fmt(doc.savedAt!) })
    : t('cv.savedOn', { date: fmt(doc.savedAt!) });

  return (
    <Modal open wide title={t('cv.title', { name })} onClose={onClose}
      tabs={<div className="tabs" role="tablist">{MODES.map((m) => (
        <button key={m} role="tab" type="button" className="tab" aria-selected={mode === m} disabled={!!busy}
          onClick={() => { setMode(m); setRun((r) => ({ n: r.n + 1, force: false })); }} data-testid={`cv-${m}`}>{t(`cv.mode.${m}`)}</button>
      ))}</div>}
      footer={<>
        <span className={`cv-hint${doc?.stale ? ' cv-stale' : ''}`} data-testid="cv-status">{doc ? status : ''}</span>
        <span className="spacer" />
        <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
        {doc && <a className="btn btn-secondary" href={doc.url} download={downloadName} data-testid="cv-download"><Download size={16} />{t('cv.download')}</a>}
        {mode !== 'original' && !busy && (doc || error) && (
          <Button variant={doc?.stale ? 'primary' : 'secondary'} onClick={() => setRun((r) => ({ n: r.n + 1, force: true }))} data-testid="cv-regenerate"
            title={mode === 'en' ? t('cv.regenerateHintEn') : t('cv.regenerateHint')}><RefreshCw size={16} />{t('cv.regenerate')}</Button>
        )}
      </>}>
      <div className="cv-preview">
        {busy && <Loader label={busy} delay={0} />}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {doc && (doc.pdf
          ? <iframe title={downloadName} src={doc.url} data-testid="cv-frame" />
          : <p className="muted">{t('cv.noPreview')}</p>)}
      </div>
    </Modal>
  );
}
