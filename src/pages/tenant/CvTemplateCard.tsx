// Plantilla del CV con la marca del tenant: cabecera/pie (imágenes), texto del pie, foto y vista previa con un talento de ejemplo.
import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { assetUrl, useTheme, type Branding as B } from '../../providers/theme';
import { Button, Card, Field, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { buildCvTemplate } from '../../lib/cv/buildCv';
import type { CvData, CvLang } from '../../lib/cv/CvDocument';

const SAMPLE: Record<CvLang, CvData> = {
  es: {
    name: 'Ana María Quispe Rojas', headline: 'Desarrolladora Java Senior', location: 'Lima, Perú',
    summary: 'Ingeniera de software con 8 años de experiencia en banca y retail, especializada en microservicios, integración continua y liderazgo técnico de equipos ágiles.',
    experiences: [
      { company: 'Banco Andino', position: 'Líder técnico', start: '2021-03-01', current: true, functions: 'Diseño de microservicios en Java/Spring, revisión de código y mentoría del equipo.' },
      { company: 'Retail Plus', position: 'Desarrolladora backend', start: '2017-01-01', end: '2021-02-01', current: false, functions: 'APIs REST, integración con pasarelas de pago y optimización de consultas SQL.' },
    ],
    educations: [{ institution: 'Universidad Nacional de Ingeniería', career: 'Ingeniería de Sistemas', grade: 'Título', start: '2010-01-01', end: '2015-01-01', current: false, yearOnly: true }],
    certifications: [{ institution: 'Oracle', career: 'Java SE 17 Developer', grade: 'Curso', start: '2022-01-01', current: false, yearOnly: true }],
    tech: [{ name: 'Java', years: 8 }, { name: 'Spring Boot', years: 6 }, { name: 'SQL', years: 8 }], soft: ['Liderazgo', 'Comunicación'],
    languages: [{ name: 'Inglés', level: 'Avanzado' }],
  },
  en: {
    name: 'Ana María Quispe Rojas', headline: 'Senior Java Developer', location: 'Lima, Peru',
    summary: 'Software engineer with 8 years of experience in banking and retail, specialized in microservices, continuous integration and technical leadership of agile teams.',
    experiences: [
      { company: 'Banco Andino', position: 'Tech lead', start: '2021-03-01', current: true, functions: 'Microservice design in Java/Spring, code reviews and team mentoring.' },
      { company: 'Retail Plus', position: 'Backend developer', start: '2017-01-01', end: '2021-02-01', current: false, functions: 'REST APIs, payment gateway integrations and SQL query optimization.' },
    ],
    educations: [{ institution: 'Universidad Nacional de Ingeniería', career: 'Systems Engineering', grade: 'Degree', start: '2010-01-01', end: '2015-01-01', current: false, yearOnly: true }],
    certifications: [{ institution: 'Oracle', career: 'Java SE 17 Developer', grade: 'Course', start: '2022-01-01', current: false, yearOnly: true }],
    tech: [{ name: 'Java', years: 8 }, { name: 'Spring Boot', years: 6 }, { name: 'SQL', years: 8 }], soft: ['Leadership', 'Communication'],
    languages: [{ name: 'English', level: 'Advanced' }],
  },
};

export function CvTemplateCard() {
  const { t, i18n } = useTranslation();
  const { branding, setBranding } = useTheme();
  const toast = useToast();
  const errText = useErrorText();
  const [footerText, setFooterText] = useState(branding?.cvFooterText ?? '');
  const [showPhoto, setShowPhoto] = useState(!!branding?.cvShowPhoto);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  if (!branding) return null;

  const put = async (extra: { clearHeader?: boolean; clearFooter?: boolean } = {}) => {
    setBusy(true);
    try {
      setBranding(await http.put<B>('/api/v1/tenant/branding/cv', { footerText, showPhoto, clearHeader: false, clearFooter: false, ...extra }));
      toast.success(t('branding.cvSaved'));
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = (kind: 'cv_header' | 'cv_footer') => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      setBranding(await http.post<B>(`/api/v1/tenant/branding/files/${kind}`, fd));
      toast.success(t('branding.cvSaved'));
    } catch (err) {
      toast.error(errText(err));
    }
  };
  const showSample = async () => {
    setPreviewing(true);
    try {
      const lang: CvLang = i18n.language.startsWith('en') ? 'en' : 'es';
      const [{ pdf }, { CvDocument }, tpl] = await Promise.all([import('@react-pdf/renderer'), import('../../lib/cv/CvDocument'), buildCvTemplate(branding)]);
      const blob = await pdf(<CvDocument data={SAMPLE[lang]} tpl={{ ...tpl, footerText: footerText || tpl.footerText, showPhoto: false }} lang={lang} generatedAt={new Date()} />).toBlob();
      setPreview({ url: URL.createObjectURL(blob) });
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setPreviewing(false);
    }
  };
  const closePreview = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); };

  const img = (url: string | undefined, kind: 'cv_header' | 'cv_footer', title: string, hint?: string) => (
    <div className="stack" style={{ gap: 8 }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      {url && <img className="cv-tpl-img" src={assetUrl(url)} alt={title} />}
      <div className="row" style={{ gap: 8 }}>
        <label className="btn btn-secondary btn-sm">
          {t('branding.upload')}
          <input type="file" accept="image/png,image/jpeg" hidden onChange={upload(kind)} data-testid={`${kind}-input`} />
        </label>
        {url && <Button variant="secondary" size="sm" onClick={() => put(kind === 'cv_header' ? { clearHeader: true } : { clearFooter: true })}>{t('branding.cvRemove')}</Button>}
      </div>
      {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );

  return (
    <Card title={t('branding.cvTitle')} actions={<Button variant="secondary" size="sm" onClick={showSample} loading={previewing} data-testid="cv-sample">{t('branding.cvPreview')}</Button>}>
      <div className="stack" data-testid="cv-template">
        <p className="muted" style={{ margin: 0 }}>{t('branding.cvSubtitle')}</p>
        {img(branding.cvHeaderUrl, 'cv_header', t('branding.cvHeader'), t('branding.cvHeaderHint'))}
        {img(branding.cvFooterUrl, 'cv_footer', t('branding.cvFooter'))}
        <Field label={t('branding.cvFooterText')} maxLength={300} value={footerText} placeholder={t('branding.cvFooterTextPh')} onChange={(e) => setFooterText(e.target.value)} />
        <label className="checkbox"><input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} />{t('branding.cvShowPhoto')}</label>
        <div><Button onClick={() => put()} loading={busy} data-testid="cv-template-save">{t('branding.cvSave')}</Button></div>
      </div>
      {preview && (
        <Modal open wide title={t('branding.cvSample')} onClose={closePreview}
          footer={<Button variant="secondary" onClick={closePreview}>{t('common.close')}</Button>}>
          <div className="cv-preview"><iframe title={t('branding.cvSample')} src={preview.url} data-testid="cv-sample-frame" /></div>
        </Modal>
      )}
      {previewing && <Loader variant="overlay" label={t('cv.generating')} />}
    </Card>
  );
}
