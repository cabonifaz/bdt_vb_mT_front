// Carga rápida de un talento desde su CV (como en el sistema heredado): subir el PDF, revisar lo que leyó la IA y crear.
// Solo se revisan DNI, identidad y contacto, pero el CV se analiza entero: experiencia, estudios, habilidades, idiomas,
// resumen y redes se guardan igual que en el alta completa, y el PDF queda como CV original del talento.
// El DNI se puede consultar en el API de DNI (nombres y fecha de nacimiento) y con él se comprueba si el talento ya existe.
// No hay talentos repetidos: si ya existe uno con el mismo correo, documento o nombre completo, se avisa y solo se actualiza
// su información (con las mismas reglas que "Releer CV" al editar). Si coincide solo el nombre puede ser un homónimo:
// el usuario puede indicar que es otra persona y crearla.
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Search, Sparkles, Upload } from 'lucide-react';
import { http } from '../../lib/api';
import {
  applyCvRead, buildSaveSteps, findTalentMatch, fromTalent, runSaveSteps, uid,
  type CvApplied, type Draft, type MatchQuery, type SaveStep, type TalentMatch,
} from '../../lib/talentDraft';
import { isPdf, readCv, type CvRead } from '../../lib/cv/readCv';
import { fullName, TALENT_API, useLabel, useMasters, type MasterItem, type Talent } from '../../lib/talents';
import { Button, Field, Modal, useErrorText } from '../ui';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';

type Form = { docNumber: string; firstName: string; lastName: string; secondLastName: string; phone: string; email: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI = /^\d{8}$/;

export function QuickTalentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const masters = useMasters();
  const label = useLabel();
  const toast = useToast();
  const errText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const empty = useMemo(() => fromTalent(), []);
  const [file, setFile] = useState<File | null>(null);
  const [read, setRead] = useState<{ r: CvRead; items: MasterItem[] } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applied, setApplied] = useState<CvApplied | null>(null);
  const [existing, setExisting] = useState<TalentMatch | null>(null);
  const [form, setForm] = useState<Form>({ docNumber: '', firstName: '', lastName: '', secondLastName: '', phone: '', email: '' });
  const [birthDate, setBirthDate] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState('');
  const [looking, setLooking] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [talentId] = useState(uid);
  const [otherPerson, setOtherPerson] = useState(false); // coincidió solo el nombre y el usuario indicó que es otra persona
  const dniType = masters.byTable('DOC_IDENTITY_TYPE').find((x) => x.code === 'DNI');

  const check = async (q: MatchQuery) => {
    const m = await findTalentMatch(q, !otherPerson).catch(() => null);
    setExisting(m);
    return m;
  };
  const pick = (f?: File) => {
    if (!f) return;
    if (!isPdf(f)) { toast.error(t('talents.cvRead.pdfOnly')); return; }
    setFile(f); setRead(null); setDraft(null); setApplied(null); setExisting(null); setOtherPerson(false); setFailed([]);
  };
  const analyze = async () => {
    if (!file) return;
    setBusy(t('talents.cvRead.reading'));
    try {
      // los maestros deben estar cargados para cruzar país, idiomas, niveles, grados y habilidades
      const [r, items] = await Promise.all([readCv(file), masters.data ?? masters.refetch().then((x) => x.data ?? [])]);
      const res = applyCvRead(empty, r, items, label, file);
      const m = res.draft.main;
      setRead({ r, items }); setDraft(res.draft); setApplied(res.applied);
      setForm({ docNumber: m.docNumber, firstName: m.firstName, lastName: m.lastName, secondLastName: m.secondLastName, phone: m.phone, email: m.email });
      setErrors({});
      await check(m);
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
  // DNI: con 8 dígitos se comprueba si ya existe; "Consultar DNI" además completa nombres y fecha de nacimiento (API de DNI)
  const dniBlur = () => { if (DNI.test(form.docNumber.trim()) && !existing) void check({ ...form, docNumber: form.docNumber.trim() }); };
  const lookupDni = async () => {
    const dni = form.docNumber.trim();
    setLooking(true);
    try {
      const p = await http.get<{ firstName: string; lastName: string; secondLastName: string; birthDate?: string }>(`/api/v1/tenant/identity/dni/${dni}`);
      const next = { ...form, docNumber: dni, firstName: p.firstName || form.firstName, lastName: p.lastName || form.lastName, secondLastName: p.secondLastName || form.secondLastName };
      setForm(next);
      if (p.birthDate) setBirthDate(p.birthDate);
      toast.success(p.birthDate ? t('talents.dniFilledBirth') : t('talents.dniFilled'));
      await check(next);
    } catch (e) {
      toast.error(errText(e));
      await check({ ...form, docNumber: dni }); // sin API de DNI igual se comprueba si ya existe
    } finally {
      setLooking(false);
    }
  };
  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (form.docNumber.trim() && !/^[A-Za-z0-9-]{4,20}$/.test(form.docNumber.trim())) e.docNumber = t('talents.quick.badDoc');
    if (!form.firstName.trim()) e.firstName = t('talents.quick.required');
    if (!form.lastName.trim()) e.lastName = t('talents.quick.required');
    if (!form.phone.trim()) e.phone = t('talents.quick.required');
    else if (!/^\+?[\d\s()-]{6,20}$/.test(form.phone.trim())) e.phone = t('talents.quick.badPhone');
    if (!form.email.trim()) e.email = t('talents.quick.required');
    else if (!EMAIL.test(form.email.trim())) e.email = t('talents.quick.badEmail');
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const withIdentity = (main: Draft['main']): Draft['main'] => {
    const dni = form.docNumber.trim();
    return { ...main, docNumber: main.docNumber || dni, docTypeId: main.docTypeId || (DNI.test(dni) && dniType ? dniType.id : ''), birthDate: main.birthDate || birthDate };
  };
  const run = async (steps: SaveStep[], id: string, ok: string) => {
    const res = await runSaveSteps(steps, (current, total) => setBusy(t('talents.saving', { current, total })), errText);
    setBusy('');
    if (res.failedMain) { toast.error(res.errs[0]); return; }
    if (res.errs.length) { setFailed(res.errs); toast.error(t('talents.quick.partial')); }
    else toast.success(ok);
    onCreated(id);
  };
  // talento existente: se lee su ficha y se le vuelca el CV (completa vacíos, agrega lo nuevo, actualiza años)
  const update = async (match: TalentMatch) => {
    if (!read || !file) return;
    setBusy(t('talents.quick.updating'));
    try {
      const talent = await http.get<Talent>(`${TALENT_API}/${match.id}`);
      const original = fromTalent(talent, label);
      const { draft: d } = applyCvRead(original, read.r, read.items, label, file);
      await run(buildSaveSteps({ d: { ...d, main: withIdentity(d.main) }, original, talentId: match.id, talent, canRates: false, t }), match.id, t('talents.quick.updated'));
    } catch (e) {
      setBusy('');
      toast.error(errText(e));
    }
  };
  const submit = async () => {
    if (!draft) return;
    if (existing) { await update(existing); return; }
    if (!validate()) return;
    // los datos pudieron cambiarse a mano: se vuelve a comprobar antes de crear
    setBusy(t('talents.quick.checking'));
    const match = await check({ ...form, docNumber: form.docNumber.trim() });
    setBusy('');
    if (match) { toast.info(t('talents.quick.foundOnCreate')); return; }
    const d: Draft = { ...draft, main: withIdentity({ ...draft.main, ...form, docNumber: form.docNumber.trim() }) };
    await run(buildSaveSteps({ d, original: empty, talentId, canRates: false, t }), talentId, t('talents.quick.created'));
  };

  const summary = applied && [
    applied.exp && t('talents.cvRead.exp', { count: applied.exp }), applied.edu && t('talents.cvRead.edu', { count: applied.edu }),
    applied.tech + applied.soft && t('talents.cvRead.skills', { count: applied.tech + applied.soft }), applied.lang && t('talents.cvRead.lang', { count: applied.lang }),
  ].filter(Boolean).join(', ');
  const missing = applied?.missing.map((k) => t(`talents.quick.field.${k}`)).join(', ');
  const existsText = existing && t(existing.matchedBy === 'DOC' ? 'talents.quick.existsByDoc' : existing.matchedBy === 'NAME' ? 'talents.quick.existsByName' : 'talents.quick.existsByEmail');

  return (
    <Modal open persistent title={t('talents.quick.title')} onClose={onClose}
      footer={<>
        <span className="spacer" />
        <Button variant="secondary" onClick={onClose} disabled={!!busy}>{t('common.cancel')}</Button>
        <Button onClick={submit} disabled={!draft || !!busy || looking} data-testid="quick-create">{existing ? t('talents.quick.update') : t('talents.quick.create')}</Button>
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
          <div className="field">
            <label htmlFor="qt-dni">{t('talents.quick.dni')}</label>
            <div className="input-action">
              <input id="qt-dni" className="input" inputMode="numeric" maxLength={20} value={form.docNumber} aria-invalid={!!errors.docNumber || undefined}
                onChange={setField('docNumber')} onBlur={dniBlur}
                onKeyDown={(e) => { if (e.key === 'Enter' && DNI.test(form.docNumber.trim())) { e.preventDefault(); void lookupDni(); } }} />
              <button type="button" className="btn btn-outline btn-sm" onClick={lookupDni} disabled={!DNI.test(form.docNumber.trim()) || looking} data-testid="quick-dni-lookup"
                title={t('talents.dniLookupHint')}><Search size={15} />{looking ? t('talents.dniLooking') : t('talents.dniLookup')}</button>
            </div>
            {errors.docNumber && <span className="error">{errors.docNumber}</span>}
          </div>
          {existing && (
            <div className="alert alert-warning" role="status" data-testid="quick-exists">
              <strong>{t('talents.quick.existsTitle', { name: fullName(existing) })}</strong>
              {existing.headline && <span className="muted"> · {existing.headline}</span>}
              <div>{existsText}</div>
              {existing.matchedBy === 'NAME' && (
                <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={() => { setExisting(null); setOtherPerson(true); }} data-testid="quick-other-person">
                  {t('talents.quick.otherPerson')}</Button></div>
              )}
            </div>
          )}
          {!existing && <>
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
        </>}
        {failed.length > 0 && <div className="alert alert-error" role="alert"><ul style={{ margin: 0, paddingLeft: 18 }}>{failed.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      </div>
    </Modal>
  );
}
