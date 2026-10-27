// Generar el CV del talento: con la marca del tenant en español o inglés (traducido con IA), o el CV original que se cargó.
// El PDF se arma en el navegador (react-pdf, cargado bajo demanda) y se puede descargar o guardar en los archivos del talento.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Save } from 'lucide-react';
import { http } from '../../lib/api';
import { fetchFileBlob, fullName, TALENT_API, useMasters, type Talent } from '../../lib/talents';
import { useTheme } from '../../providers/theme';
import { Button, Modal, useErrorText } from '../ui';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';
import { buildCvData, buildCvTemplate, talentPhoto, type CvText } from '../../lib/cv/buildCv';

type Mode = 'es' | 'en' | 'original';
const MODES: Mode[] = ['es', 'en', 'original'];
const CATEGORY: Record<'es' | 'en', string> = { es: 'CV_TENANT_ES', en: 'CV_TENANT_EN' };

export function CvModal({ talent, onClose, onSaved, canSave }: { talent: Talent; onClose: () => void; onSaved: () => void; canSave: boolean }) {
  const { t } = useTranslation();
  const { branding } = useTheme();
  const masters = useMasters();
  const toast = useToast();
  const errText = useErrorText();
  const [mode, setMode] = useState<Mode>('es');
  const [doc, setDoc] = useState<{ mode: Mode; url: string; blob: Blob; pdf: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const name = fullName(talent);
  const original = talent.files.find((f) => f.category === 'CV') ?? talent.files.find((f) => f.id === talent.cvId);

  useEffect(() => {
    let alive = true;
    let url = '';
    (async () => {
      setError(''); setDoc(null);
      try {
        let blob: Blob;
        if (mode === 'original') {
          if (!original) { setError(t('cv.noOriginal')); return; }
          setBusy(t('cv.loadingOriginal'));
          blob = await fetchFileBlob(original.id, true);
        } else {
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
          blob = await pdf(<CvDocument data={data} tpl={tpl} lang={mode} generatedAt={new Date()} />).toBlob();
        }
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setDoc({ mode, url, blob, pdf: blob.type === 'application/pdf' });
      } catch (e) {
        if (alive) setError(errText(e));
      } finally {
        if (alive) setBusy('');
      }
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se regenera solo al cambiar de idioma
  }, [mode]);

  const fileName = mode === 'original' && original ? original.name
    : `${name.replace(/\s+/g, '_')}_CV_${mode.toUpperCase()}.pdf`;

  // guarda en la ficha (reemplaza el CV con marca anterior del mismo idioma)
  const save = async () => {
    if (!doc || doc.mode === 'original') return;
    setSaving(true);
    try {
      const cat = CATEGORY[doc.mode];
      const fd = new FormData();
      fd.append('file', new File([doc.blob], fileName, { type: 'application/pdf' }));
      await http.post(`${TALENT_API}/${talent.id}/files?category=${cat}`, fd);
      for (const old of talent.files.filter((f) => f.category === cat)) await http.del(`${TALENT_API}/files/${old.id}`);
      toast.success(t('cv.saved'));
      onSaved();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open wide title={t('cv.title', { name })} onClose={onClose}
      tabs={<div className="tabs" role="tablist">{MODES.map((m) => (
        <button key={m} role="tab" type="button" className="tab" aria-selected={mode === m} onClick={() => setMode(m)} disabled={!!busy}
          data-testid={`cv-${m}`}>{t(`cv.mode.${m}`)}</button>
      ))}</div>}
      footer={<>
        <span className="muted cv-hint">{t(`cv.hint.${mode}`)}</span>
        <span className="spacer" />
        <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
        {doc && <a className="btn btn-secondary" href={doc.url} download={fileName} data-testid="cv-download"><Download size={16} />{t('cv.download')}</a>}
        {doc && doc.mode !== 'original' && canSave && (
          <Button onClick={save} loading={saving} data-testid="cv-save"><Save size={16} />{t('cv.save')}</Button>
        )}
      </>}>
      <div className="cv-preview">
        {busy && <Loader label={busy} delay={0} />}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {doc && (doc.pdf
          ? <iframe title={fileName} src={doc.url} data-testid="cv-frame" />
          : <p className="muted">{t('cv.noPreview')}</p>)}
      </div>
    </Modal>
  );
}
