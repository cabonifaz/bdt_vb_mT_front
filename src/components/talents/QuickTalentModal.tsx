// Carga rápida de un talento desde su CV (como en el sistema heredado): subir el PDF, revisar lo que leyó la IA y crear.
// Solo se revisan identidad y contacto, pero el CV se analiza entero: experiencia, estudios, habilidades, idiomas,
// resumen y redes se guardan igual que en el alta completa, y el PDF queda como CV original del talento.
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Sparkles, Upload } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { applyCvRead, buildSaveSteps, fromTalent, uid, type CvApplied, type Draft } from '../../lib/talentDraft';
import { isPdf, readCv } from '../../lib/cv/readCv';
import { useLabel, useMasters } from '../../lib/talents';
import { Button, Field, Modal, useErrorText } from '../ui';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';

type Form = { firstName: string; lastName: string; secondLastName: string; phone: string; email: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function QuickTalentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const masters = useMasters();
  const label = useLabel();
  const toast = useToast();
  const errText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const empty = useMemo(() => fromTalent(), []);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applied, setApplied] = useState<CvApplied | null>(null);
  const [form, setForm] = useState<Form>({ firstName: '', lastName: '', secondLastName: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState('');
  const [failed, setFailed] = useState<string[]>([]);
  const [talentId] = useState(uid);

  const pick = (f?: File) => {
    if (!f) return;
    if (!isPdf(f)) { toast.error(t('talents.cvRead.pdfOnly')); return; }
    setFile(f); setDraft(null); setApplied(null); setFailed([]);
  };
  const analyze = async () => {
    if (!file) return;
    setBusy(t('talents.cvRead.reading'));
    try {
      // los maestros deben estar cargados para cruzar país, idiomas, niveles, grados y habilidades
      const [r, items] = await Promise.all([readCv(file), masters.data ?? masters.refetch().then((x) => x.data ?? [])]);
      const res = applyCvRead(empty, r, items, label, file);
      const m = res.draft.main;
      setDraft(res.draft); setApplied(res.applied);
      setForm({ firstName: m.firstName, lastName: m.lastName, secondLastName: m.secondLastName, phone: m.phone, email: m.email });
      setErrors({});
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy('');
    }
  };
  const setField = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.firstName.trim()) e.firstName = t('talents.quick.required');
    if (!form.lastName.trim()) e.lastName = t('talents.quick.required');
    if (!form.phone.trim()) e.phone = t('talents.quick.required');
    else if (!/^\+?[\d\s()-]{6,20}$/.test(form.phone.trim())) e.phone = t('talents.quick.badPhone');
    if (!form.email.trim()) e.email = t('talents.quick.required');
    else if (!EMAIL.test(form.email.trim())) e.email = t('talents.quick.badEmail');
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const create = async () => {
    if (!draft || !validate()) return;
    const d: Draft = { ...draft, main: { ...draft.main, ...form } };
    const steps = buildSaveSteps({ d, original: empty, talentId, canRates: false, t });
    const errs: string[] = [];
    let i = 0;
    for (const s of steps) {
      setBusy(t('talents.saving', { current: ++i, total: steps.length }));
      try {
        await s.run();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'OFFLINE' && !s.online) continue;
        if (s.key === 'main') { setBusy(''); toast.error(errText(e)); return; } // sin datos principales no hay talento
        errs.push(`${s.label}: ${errText(e)}`);
      }
    }
    setBusy('');
    if (errs.length) { setFailed(errs); toast.error(t('talents.quick.partial')); }
    else toast.success(t('talents.quick.created'));
    onCreated(talentId);
  };

  const summary = applied && [
    applied.exp && t('talents.cvRead.exp', { count: applied.exp }), applied.edu && t('talents.cvRead.edu', { count: applied.edu }),
    applied.tech + applied.soft && t('talents.cvRead.skills', { count: applied.tech + applied.soft }), applied.lang && t('talents.cvRead.lang', { count: applied.lang }),
  ].filter(Boolean).join(', ');
  const missing = applied?.missing.map((k) => t(`talents.quick.field.${k}`)).join(', ');

  return (
    <Modal open persistent title={t('talents.quick.title')} onClose={onClose}
      footer={<>
        <span className="spacer" />
        <Button variant="secondary" onClick={onClose} disabled={!!busy}>{t('common.cancel')}</Button>
        <Button onClick={create} disabled={!draft || !!busy} data-testid="quick-create">{t('talents.quick.create')}</Button>
      </>}>
      {busy && <Loader variant="overlay" label={busy} />}
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>{t('talents.quick.subtitle')}</p>
        <input ref={input} type="file" accept=".pdf,application/pdf" hidden data-testid="quick-file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
        <button type="button" className="file-drop" onClick={() => input.current?.click()} disabled={!!busy}>
          <span className="file-drop-icon">{file ? <FileText size={18} /> : <Upload size={18} />}</span>
          <span className="file-drop-text">
            <strong>{file ? file.name : t('talents.quick.pick')}</strong>
            <span className="muted">{file ? t('talents.quick.change') : t('talents.quick.pickHint')}</span>
          </span>
        </button>
        {file && !draft && (
          <Button onClick={analyze} disabled={!!busy} data-testid="quick-analyze"><Sparkles size={16} />{t('talents.quick.analyze')}</Button>
        )}
        {draft && <>
          {summary && <div className="alert alert-info" data-testid="quick-summary">{t('talents.quick.alsoSaved', { items: summary })}</div>}
          {missing && <div className="alert alert-warning">{t('talents.quick.missing', { fields: missing })}</div>}
          <div className="form-grid">
            <Field label={t('talents.firstName')} required maxLength={100} value={form.firstName} onChange={setField('firstName')} error={errors.firstName} />
            <Field label={t('talents.lastName')} required maxLength={100} value={form.lastName} onChange={setField('lastName')} error={errors.lastName} />
            <Field label={t('talents.secondLastName')} maxLength={100} value={form.secondLastName} onChange={setField('secondLastName')} />
            <Field label={t('talents.phone')} required type="tel" maxLength={30} placeholder="+51 987654321" value={form.phone} onChange={setField('phone')} error={errors.phone} />
            <Field label={t('talents.email')} required type="email" maxLength={254} value={form.email} onChange={setField('email')} error={errors.email} />
          </div>
        </>}
        {failed.length > 0 && <div className="alert alert-error" role="alert"><ul style={{ margin: 0, paddingLeft: 18 }}>{failed.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      </div>
    </Modal>
  );
}
