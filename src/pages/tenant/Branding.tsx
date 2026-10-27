import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { ALLOWED_FONTS, applyBranding, assetUrl, useTheme, type Branding as B } from '../../providers/theme';
import { Button, Card, ColorField, Field, SelectField, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type Form = Pick<B, 'displayName' | 'colorPrimary' | 'colorPrimaryHover' | 'colorSecondary' | 'colorAccent' | 'colorSidebar' | 'fontFamily'>;

export function Branding() {
  const { t } = useTranslation();
  const { branding, setBranding } = useTheme();
  const toast = useToast();
  const errText = useErrorText();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (branding && !form) {
      const { displayName, colorPrimary, colorPrimaryHover, colorSecondary, colorAccent, colorSidebar, fontFamily } = branding;
      setForm({ displayName, colorPrimary, colorPrimaryHover, colorSecondary, colorAccent, colorSidebar, fontFamily });
    }
  }, [branding, form]);

  // Vista previa en vivo; si se abandona la página sin guardar se restaura la marca vigente
  const saved = useRef(branding);
  saved.current = branding;
  useEffect(() => { if (form) applyBranding(form); }, [form]);
  useEffect(() => () => { if (saved.current) applyBranding(saved.current); }, []);

  if (!form || !branding) return <div className="page"><p className="muted">{t('common.loading')}</p></div>;
  const set = (k: keyof Form) => (v: string) => setForm({ ...form, [k]: v });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await http.put<B>('/api/v1/tenant/branding', form);
      setBranding(b);
      toast.success(t('branding.saved'));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const upload = (kind: 'logo' | 'favicon') => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const b = await http.post<B>(`/api/v1/tenant/branding/files/${kind}`, fd);
      setBranding(b);
      toast.success(t('branding.saved'));
    } catch (err) {
      toast.error(errText(err));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('branding.title')}</h1><p className="muted">{t('branding.subtitle')}</p></div>
        <Button onClick={save} loading={busy} data-testid="save-branding">{t('common.save')}</Button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
        <Card title={t('branding.title')}>
          <div className="stack">
            <Field label={t('branding.displayName')} value={form.displayName} maxLength={150} onChange={(e) => set('displayName')(e.target.value)} />
            <ColorField label={t('branding.primary')} value={form.colorPrimary} onChange={set('colorPrimary')} />
            <ColorField label={t('branding.primaryHover')} value={form.colorPrimaryHover} onChange={set('colorPrimaryHover')} />
            <ColorField label={t('branding.secondary')} value={form.colorSecondary} onChange={set('colorSecondary')} />
            <ColorField label={t('branding.accent')} value={form.colorAccent} onChange={set('colorAccent')} />
            <ColorField label={t('branding.sidebar')} value={form.colorSidebar} onChange={set('colorSidebar')} />
            <SelectField label={t('branding.font')} value={form.fontFamily} onChange={set('fontFamily')}
              options={ALLOWED_FONTS.map((f) => ({ value: f, label: f }))} />
          </div>
        </Card>
        <div className="stack" style={{ gap: 24 }}>
          <Card title={t('branding.logo')}>
            <div className="stack">
              <div style={{ padding: 16, border: '1px dashed var(--color-border-strong)', borderRadius: 8, background: form.colorSidebar }}>
                <img src={assetUrl(branding.logoUrl)} alt={branding.displayName} style={{ maxHeight: 56, maxWidth: '100%' }} />
              </div>
              <label className="btn btn-secondary">
                {t('branding.upload')}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload('logo')} data-testid="logo-input" />
              </label>
              <span className="muted" style={{ fontSize: 12 }}>{t('branding.uploadHint')}</span>
            </div>
          </Card>
          <Card title={t('branding.favicon')}>
            <label className="btn btn-secondary">
              {t('branding.upload')}
              <input type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon" hidden onChange={upload('favicon')} />
            </label>
          </Card>
          <Card title={t('branding.preview')}>
            <div className="row">
              <Button type="button">{t('branding.sampleButton')}</Button>
              <span className="badge badge-info">Badge</span>
              <a href="#" onClick={(e) => e.preventDefault()}>Link</a>
            </div>
            <div className="accent-bar" style={{ marginTop: 16, borderRadius: 4 }} />
          </Card>
        </div>
      </div>
    </div>
  );
}
