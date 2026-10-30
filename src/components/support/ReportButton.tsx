// Reportar al equipo de la plataforma (Super Admin) una incidencia, observación o mejora desde cualquier pantalla.
// Se guarda automáticamente el origen (pantalla, ruta, módulo y registro abierto); se pueden adjuntar imágenes
// (también pegando una captura con Ctrl+V o arrastrándola) y referencias.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, MapPin, Plus, X } from 'lucide-react';
import { useAuth } from '../../providers/auth';
import { SUPPORT_IMPACTS, SUPPORT_KINDS, createTicket, currentOrigin, type SupportImpact, type SupportKind, type SupportOrigin } from '../../lib/support';
import { Button, Field, Modal, useErrorText } from '../ui';
import { useToast } from '../ui/Toast';
import { AttachmentPicker, type Picked } from './AttachmentPicker';

export function ReportButton() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [origin, setOrigin] = useState<SupportOrigin | null>(null);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={() => setOrigin(currentOrigin(pathname))}
        aria-label={t('support.report')} title={t('support.report')} data-testid="report-button">
        <LifeBuoy size={18} />
      </button>
      {origin && <ReportModal origin={origin} onClose={() => setOrigin(null)} />}
    </>
  );
}

export function ReportModal({ origin, onClose }: { origin: SupportOrigin; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [kind, setKind] = useState<SupportKind>('INCIDENT');
  const [impact, setImpact] = useState<SupportImpact>('MEDIUM');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [refs, setRefs] = useState<string[]>(['']);
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploading = files.some((f) => !f.id && !f.error);
  const ready = title.trim() && body.trim() && !uploading;
  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      const r = await createTicket({ kind, impact, title: title.trim(), body: body.trim(), origin, refs: refs.map((x) => x.trim()).filter(Boolean),
        files: files.filter((f) => f.id).map((f) => f.id!) });
      toast.success(t('support.sent', { number: r.number }));
      void qc.invalidateQueries({ queryKey: ['support'] });
      onClose();
      nav(`/${user?.tenantSlug}/soporte/${r.id}`);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open persistent title={t('support.newTitle')} onClose={onClose} footer={<>
      <span className="spacer" />
      <Button variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
      <Button onClick={submit} loading={busy} disabled={!ready} data-testid="support-send">{t('support.send')}</Button></>}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="support-origin" data-testid="support-origin"><MapPin size={14} aria-hidden />
        <span>{t('support.from')} <strong>{origin.screen || origin.module}</strong> <span className="muted">· {origin.path}</span></span></div>
      <fieldset className="seg-group" data-testid="support-kind">
        <legend className="sr-only">{t('support.kind')}</legend>
        {SUPPORT_KINDS.map((k) => (
          <label key={k} className={`seg${kind === k ? ' on' : ''}`}>
            <input type="radio" name="support-kind" value={k} checked={kind === k} onChange={() => setKind(k)} data-testid={`support-kind-${k}`} />
            <span><strong>{t(`support.kinds.${k}`)}</strong><small>{t(`support.kindHints.${k}`)}</small></span>
          </label>
        ))}
      </fieldset>
      <Field label={t('support.title')} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={t(`support.titlePlaceholder.${kind}`)} data-testid="support-title" />
      <div className="field">
        <label htmlFor="support-body">{t('support.body')}</label>
        <textarea id="support-body" className="textarea" rows={5} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={t(`support.bodyPlaceholder.${kind}`)} data-testid="support-body" />
      </div>
      <div className="field">
        <label htmlFor="support-impact">{t('support.impact')}</label>
        <select id="support-impact" className="select" value={impact} onChange={(e) => setImpact(e.target.value as SupportImpact)}>
          {SUPPORT_IMPACTS.map((x) => <option key={x} value={x}>{t(`support.impacts.${x}`)}</option>)}
        </select>
      </div>
      <AttachmentPicker files={files} onChange={setFiles} />
      <div className="field">
        <label>{t('support.refs')}</label>
        {refs.map((r, i) => (
          <div key={i} className="row" style={{ gap: 6, marginBottom: 6 }}>
            <input className="input" maxLength={500} value={r} placeholder={t('support.refPlaceholder')} aria-label={t('support.refN', { n: i + 1 })}
              onChange={(e) => setRefs(refs.map((x, k) => (k === i ? e.target.value : x)))} data-testid="support-ref" />
            {refs.length > 1 && <button type="button" className="icon-ghost" onClick={() => setRefs(refs.filter((_, k) => k !== i))} aria-label={t('common.remove')}><X size={15} /></button>}
          </div>
        ))}
        {refs.length < 10 && <Button size="sm" variant="ghost" type="button" onClick={() => setRefs([...refs, ''])}><Plus size={14} />{t('support.addRef')}</Button>}
      </div>
    </Modal>
  );
}
