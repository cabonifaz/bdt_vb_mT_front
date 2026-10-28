// Plantilla del CV con la marca del tenant: cabecera/pie (imágenes), texto del pie, foto y vista previa con un talento de ejemplo.
// El formato se puede adoptar de un CV de ejemplo en PDF (se analiza en el navegador) y luego ajustar a mano.
import { useState, type ChangeEvent } from 'react';
import { FileUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { assetUrl, useTheme, type Branding as B } from '../../providers/theme';
import { Button, Card, Field, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { buildCvTemplate } from '../../lib/cv/buildCv';
import type { CvData, CvLang, CvStyle } from '../../lib/cv/CvDocument';

const DEFAULT_STYLE: CvStyle = { nameAlign: 'left', headingRule: true, summaryHeading: true, boldPositions: false, font: 'Helvetica' };
const FOOTER_BG = '#F3F4F6';

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
  const [style, setStyle] = useState<CvStyle | null>(branding?.cvStyle ?? null);
  const [busy, setBusy] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  if (!branding) return null;

  const put = async (extra: { clearHeader?: boolean; clearFooter?: boolean } = {}) => {
    setBusy(true);
    try {
      setBranding(await http.put<B>('/api/v1/tenant/branding/cv', { footerText, showPhoto, clearHeader: false, clearFooter: false, style, ...extra }));
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
  // CV de ejemplo en PDF: se adopta su cabecera, pie y formato, se guarda y se muestra la vista previa
  const adopt = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast.error(t('branding.cvAdoptPdfOnly')); return; }
    setAdopting(true);
    try {
      const { analyzeCvSample } = await import('../../lib/cv/analyzeSample');
      const sample = await analyzeCvSample(file).catch(() => null);
      if (!sample) { toast.error(t('branding.cvAdoptFail')); return; }
      if (sample.header) {
        const fd = new FormData();
        fd.append('file', new File([sample.header], 'cv-cabecera.png', { type: 'image/png' }));
        await http.post<B>('/api/v1/tenant/branding/files/cv_header', fd);
      }
      const text = sample.footerText ?? footerText;
      const b = await http.put<B>('/api/v1/tenant/branding/cv', { footerText: text, showPhoto, clearHeader: !sample.header, clearFooter: true, style: sample.style });
      setBranding(b); setFooterText(text); setStyle(sample.style);
      toast.success(t('branding.cvAdopted'));
      await showSample(b, text, sample.style);
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setAdopting(false);
    }
  };
  const showSample = async (b: B = branding, text = footerText, st: CvStyle | null = style) => {
    setPreviewing(true);
    try {
      const lang: CvLang = i18n.language.startsWith('en') ? 'en' : 'es';
      const [{ pdf }, { CvDocument }, tpl] = await Promise.all([import('@react-pdf/renderer'), import('../../lib/cv/CvDocument'), buildCvTemplate(b)]);
      const blob = await pdf(<CvDocument data={SAMPLE[lang]} tpl={{ ...tpl, footerText: text || tpl.footerText, showPhoto: false, style: st ?? undefined }} lang={lang} generatedAt={new Date()} />).toBlob();
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
    <Card title={t('branding.cvTitle')} actions={<Button variant="secondary" size="sm" onClick={() => showSample()} loading={previewing} data-testid="cv-sample">{t('branding.cvPreview')}</Button>}>
      <div className="stack" data-testid="cv-template">
        <p className="muted" style={{ margin: 0 }}>{t('branding.cvSubtitle')}</p>
        <div className="cv-adopt">
          <strong style={{ fontSize: 13 }}>{t('branding.cvAdopt')}</strong>
          <span className="muted" style={{ fontSize: 12 }}>{t('branding.cvAdoptHint')}</span>
          <div><label className="btn btn-secondary btn-sm">
            <FileUp size={16} />{t('branding.cvAdoptPick')}
            <input type="file" accept="application/pdf,.pdf" hidden onChange={adopt} data-testid="cv-adopt-input" disabled={adopting} />
          </label></div>
        </div>
        {img(branding.cvHeaderUrl, 'cv_header', t('branding.cvHeader'), t('branding.cvHeaderHint'))}
        {img(branding.cvFooterUrl, 'cv_footer', t('branding.cvFooter'))}
        <Field label={t('branding.cvFooterText')} maxLength={300} value={footerText} placeholder={t('branding.cvFooterTextPh')} onChange={(e) => setFooterText(e.target.value)} />
        <label className="checkbox"><input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} />{t('branding.cvShowPhoto')}</label>
        <div className="stack" style={{ gap: 8 }} data-testid="cv-format">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>{t('branding.cvFormat')}</strong>
            <span className="muted" style={{ fontSize: 12 }} data-testid="cv-format-kind">{style ? t('branding.cvCustomFormat') : t('branding.cvResetFormat')}</span>
            <span className="spacer" />
            {style
              ? <Button variant="secondary" size="sm" onClick={() => setStyle(null)}>{t('branding.cvResetFormat')}</Button>
              : <Button variant="secondary" size="sm" onClick={() => setStyle({ ...DEFAULT_STYLE, nameColor: branding.colorPrimary, headingColor: branding.colorPrimary })}>{t('branding.cvCustomize')}</Button>}
          </div>
          {style && <StyleFields style={style} onChange={setStyle} />}
        </div>
        <div><Button onClick={() => put()} loading={busy} data-testid="cv-template-save">{t('branding.cvSave')}</Button></div>
      </div>
      {preview && (
        <Modal open wide title={t('branding.cvSample')} onClose={closePreview}
          footer={<Button variant="secondary" onClick={closePreview}>{t('common.close')}</Button>}>
          <div className="cv-preview"><iframe title={t('branding.cvSample')} src={preview.url} data-testid="cv-sample-frame" /></div>
        </Modal>
      )}
      {(previewing || adopting) && <Loader variant="overlay" label={adopting ? t('branding.cvAdopting') : t('cv.generating')} />}
    </Card>
  );
}

function StyleFields({ style, onChange }: { style: CvStyle; onChange: (s: CvStyle) => void }) {
  const { t } = useTranslation();
  const set = <K extends keyof CvStyle>(k: K, v: CvStyle[K]) => onChange({ ...style, [k]: v });
  const check = (k: 'headingRule' | 'summaryHeading' | 'boldPositions', label: string) => (
    <label className="checkbox"><input type="checkbox" checked={style[k]} onChange={(e) => set(k, e.target.checked)} data-testid={`cv-style-${k}`} />{label}</label>
  );
  return (
    <div className="cv-style-grid">
      <div className="field"><label htmlFor="cv-name-align">{t('branding.cvNameAlign')}</label>
        <select id="cv-name-align" className="select" value={style.nameAlign} onChange={(e) => set('nameAlign', e.target.value as CvStyle['nameAlign'])}>
          <option value="left">{t('branding.cvAlignLeft')}</option><option value="center">{t('branding.cvAlignCenter')}</option>
        </select></div>
      <div className="field"><label htmlFor="cv-font">{t('branding.cvFont')}</label>
        <select id="cv-font" className="select" value={style.font} onChange={(e) => set('font', e.target.value as CvStyle['font'])}>
          <option value="Helvetica">{t('branding.cvFontSans')}</option><option value="Times-Roman">{t('branding.cvFontSerif')}</option>
        </select></div>
      <div className="field"><label htmlFor="cv-name-color">{t('branding.cvNameColor')}</label>
        <input id="cv-name-color" type="color" className="cv-color" value={style.nameColor ?? '#111827'} onChange={(e) => set('nameColor', e.target.value.toUpperCase())} /></div>
      <div className="field"><label htmlFor="cv-heading-color">{t('branding.cvHeadingColor')}</label>
        <input id="cv-heading-color" type="color" className="cv-color" value={style.headingColor ?? '#111827'} onChange={(e) => set('headingColor', e.target.value.toUpperCase())} /></div>
      {check('headingRule', t('branding.cvHeadingRule'))}
      {check('summaryHeading', t('branding.cvSummaryHeading'))}
      {check('boldPositions', t('branding.cvBoldPositions'))}
      <label className="checkbox"><input type="checkbox" checked={!!style.footerBg} onChange={(e) => set('footerBg', e.target.checked ? FOOTER_BG : undefined)} data-testid="cv-style-footerBox" />{t('branding.cvFooterBox')}</label>
    </div>
  );
}
