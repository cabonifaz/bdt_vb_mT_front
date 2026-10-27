// Editor de talento en modal con pestañas: alta con TODAS las secciones y edición completa.
// Cada elemento tiene uuid propio => guardar es idempotente (reintentos y cola offline no duplican).
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { TALENT_API, useLabel, useMasters, type Rates, type Talent } from '../../lib/talents';
import { Button, Field, Modal, useErrorText } from '../../components/ui';
import { Chip, Stars } from '../../components/talents/bits';
import { Loader } from '../../components/ui/Loader';
import { ProfileMeter } from '../../components/talents/ProfileMeter';
import { hasRates, type ProfileFacts } from '../../lib/completeness';

type Main = {
  firstName: string; lastName: string; secondLastName: string; headline: string; docTypeId: string; docNumber: string;
  email: string; phone: string; countryId: string; city: string; linkedinUrl: string; githubUrl: string; summary: string;
  availabilityId: string; hasEquipment: '' | 'yes' | 'no';
};
type Tech = { id: string; skillId?: string; label: string; years: number };
type Soft = { id: string; skillId?: string; label: string };
type Exp = { id: string; company: string; position: string; startDate: string; endDate: string; isCurrent: boolean; functions: string };
type Edu = { id: string; institution: string; career: string; gradeId: string; startDate: string; endDate: string; isCurrent: boolean; datePrecision: string };
type Lang = { id: string; languageId: string; levelId: string; stars: number };
type NewFile = { id: string; category: string; file: File };
type Draft = { main: Main; rates: Rates; tech: Tech[]; soft: Soft[]; exp: Exp[]; edu: Edu[]; lang: Lang[]; feedback: { stars: number; comment: string }; files: NewFile[] };

const TABS = ['data', 'skills', 'experience', 'education', 'languages', 'feedback', 'files'] as const;
type Tab = (typeof TABS)[number];
const uid = () => crypto.randomUUID();
const nz = (s: string) => (s.trim() === '' ? null : s.trim());
const num = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : Number(v));

function fromTalent(t?: Talent, label?: (l?: Record<string, string>) => string): Draft {
  const L = label ?? ((l?: Record<string, string>) => l?.es ?? '');
  return {
    main: {
      firstName: t?.firstName ?? '', lastName: t?.lastName ?? '', secondLastName: t?.secondLastName ?? '', headline: t?.headline ?? '',
      docTypeId: t?.docTypeId ?? '', docNumber: t?.docNumber ?? '', email: t?.email ?? '', phone: t?.phone ?? '',
      countryId: t?.countryId ?? '', city: t?.city ?? '', linkedinUrl: t?.linkedinUrl ?? '', githubUrl: t?.githubUrl ?? '',
      summary: t?.summary ?? '', availabilityId: t?.availabilityId ?? '',
      hasEquipment: t?.hasEquipment === undefined || t?.hasEquipment === null ? '' : t.hasEquipment ? 'yes' : 'no',
    },
    rates: t?.rates ?? {},
    tech: (t?.techSkills ?? []).map((s) => ({ id: s.id, skillId: s.skillId, label: L(s.label), years: s.years })),
    soft: (t?.softSkills ?? []).map((s) => ({ id: s.id, skillId: s.skillId, label: L(s.label) })),
    exp: (t?.experiences ?? []).map((e) => ({ id: e.id, company: e.company, position: e.position, startDate: e.startDate, endDate: e.endDate ?? '', isCurrent: e.isCurrent, functions: e.functions ?? '' })),
    edu: (t?.educations ?? []).map((e) => ({ id: e.id, institution: e.institution, career: e.career, gradeId: e.gradeId ?? '', startDate: e.startDate ?? '', endDate: e.endDate ?? '', isCurrent: e.isCurrent, datePrecision: e.datePrecision })),
    lang: (t?.languages ?? []).map((l) => ({ id: l.id, languageId: l.languageId, levelId: l.levelId, stars: l.stars })),
    feedback: { stars: 0, comment: '' },
    files: [],
  };
}

export function TalentEditor({ talent, onClose, onSaved }: { talent?: Talent; onClose: () => void; onSaved: (id: string, offline: boolean) => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const errText = useErrorText();
  const editing = !!talent;
  const canRates = can('talent.rates.read');
  const original = useMemo(() => fromTalent(talent, label), [talent]); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState<Draft>(original);
  const [talentId] = useState(talent?.id ?? uid());
  const [tab, setTab] = useState<Tab>('data');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [mainSaved, setMainSaved] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set()); // pasos ya guardados (para reintentos)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const valid = d.main.firstName.trim() !== '' && d.main.lastName.trim() !== '';

  const save = async () => {
    setBusy(true);
    setErrors([]);
    let offline = false;
    const errs: string[] = [];
    const doneNow = new Set(done);
    type Step = { key: string; label: string; run: () => Promise<unknown>; online?: boolean };
    const steps: Step[] = [];
    const m = d.main;
    if (!mainSaved) {
      const body: Record<string, unknown> = {
        id: talentId, firstName: m.firstName.trim(), lastName: m.lastName.trim(), secondLastName: nz(m.secondLastName), headline: nz(m.headline),
        docTypeId: nz(m.docTypeId), docNumber: m.docNumber.trim(), email: m.email.trim(), phone: m.phone.trim(), countryId: nz(m.countryId),
        city: nz(m.city), linkedinUrl: nz(m.linkedinUrl), githubUrl: nz(m.githubUrl), summary: nz(m.summary), availabilityId: nz(m.availabilityId),
        hasEquipment: m.hasEquipment === '' ? null : m.hasEquipment === 'yes',
      };
      if (editing) body.expectedVersion = talent!.version;
      if (canRates) body.rates = { modalityId: d.rates.modalityId || undefined, payrollMin: num(d.rates.payrollMin), payrollMax: num(d.rates.payrollMax),
        payrollCurrencyId: d.rates.payrollCurrencyId || undefined, rxhMin: num(d.rates.rxhMin), rxhMax: num(d.rates.rxhMax),
        rxhCurrencyId: d.rates.rxhCurrencyId || undefined, notes: d.rates.notes || undefined };
      steps.push({ key: 'main', label: t('talents.personal'), run: () => editing ? http.put(`${TALENT_API}/${talentId}`, body, true) : http.post(TALENT_API, body, true) });
    }
    // eliminaciones (solo edición)
    const removed = <T extends { id: string }>(orig: T[], cur: T[]) => orig.filter((o) => !cur.some((c) => c.id === o.id));
    const changed = <T extends { id: string }>(orig: T[], cur: T[]) => cur.filter((c) => JSON.stringify(orig.find((o) => o.id === c.id)) !== JSON.stringify(c));
    for (const [sec, o, c] of [['tech-skills', original.tech, d.tech], ['soft-skills', original.soft, d.soft], ['experiences', original.exp, d.exp],
      ['educations', original.edu, d.edu], ['languages', original.lang, d.lang]] as [string, { id: string }[], { id: string }[]][]) {
      removed(o, c).forEach((x) => steps.push({ key: `del:${x.id}`, label: t('talents.delete'), run: () => http.del(`${TALENT_API}/sections/${sec}/${x.id}`) }));
    }
    changed(original.tech, d.tech).forEach((s) => steps.push({ key: `tech:${s.id}:${s.years}`, label: s.label,
      run: () => http.put(`${TALENT_API}/${talentId}/tech-skills`, s.skillId ? { id: s.id, skillId: s.skillId, years: s.years } : { id: s.id, label: s.label, years: s.years }, true) }));
    changed(original.soft, d.soft).forEach((s) => steps.push({ key: `soft:${s.id}`, label: s.label,
      run: () => http.post(`${TALENT_API}/${talentId}/soft-skills`, s.skillId ? { id: s.id, skillId: s.skillId } : { id: s.id, label: s.label }, true) }));
    changed(original.exp, d.exp).forEach((e) => steps.push({ key: `exp:${JSON.stringify(e)}`, label: e.position,
      run: () => http.put(`${TALENT_API}/${talentId}/experiences`, { ...e, endDate: e.isCurrent ? null : e.endDate || null, functions: e.functions || null }, true) }));
    changed(original.edu, d.edu).forEach((e) => steps.push({ key: `edu:${JSON.stringify(e)}`, label: e.career,
      run: () => http.put(`${TALENT_API}/${talentId}/educations`, { ...e, gradeId: e.gradeId || null, startDate: e.startDate || null, endDate: e.isCurrent ? null : e.endDate || null }, true) }));
    changed(original.lang, d.lang).forEach((l) => steps.push({ key: `lang:${JSON.stringify(l)}`, label: t('talents.language'),
      run: () => http.put(`${TALENT_API}/${talentId}/languages`, l, true) }));
    if (d.feedback.stars > 0 && d.feedback.comment.trim()) {
      steps.push({ key: `fb:${d.feedback.stars}:${d.feedback.comment}`, label: t('talents.feedback'), run: () => http.put(`${TALENT_API}/${talentId}/feedback`, { id: uid(), ...d.feedback }, true) });
    }
    d.files.forEach((f) => steps.push({ key: `file:${f.id}`, label: f.file.name, online: true, run: () => {
      const fd = new FormData();
      fd.append('file', f.file);
      return http.post(`${TALENT_API}/${talentId}/files?category=${f.category}`, fd);
    } }));

    let i = 0;
    for (const s of steps) {
      i++;
      if (doneNow.has(s.key)) continue;
      setProgress(t('talents.saving', { current: i, total: steps.length }));
      if (s.online && (offline || !navigator.onLine)) { errs.push(`${s.label}: ${t('talents.fileNeedsConnection')}`); continue; }
      try {
        await s.run();
        doneNow.add(s.key);
        if (s.key === 'main') setMainSaved(true);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'OFFLINE') { offline = true; doneNow.add(s.key); if (s.key === 'main') setMainSaved(true); continue; }
        errs.push(`${s.label}: ${errText(e)}`);
        if (s.key === 'main') break; // sin datos principales no se puede seguir
      }
    }
    setDone(doneNow);
    setBusy(false);
    setProgress('');
    if (errs.length) {
      setErrors(errs);
      return;
    }
    onSaved(talentId, offline);
  };

  // perfil completo en vivo: lo que ya tiene el talento + lo que se está cargando en el editor
  const m0 = d.main;
  const newCat = (c: string) => d.files.some((f) => f.category.startsWith(c));
  const facts: ProfileFacts = {
    photo: !!talent?.photoId || newCat('PHOTO'), cv: !!talent?.cvId || !!talent?.files.some((f) => f.category.startsWith('CV')) || newCat('CV'),
    headline: !!m0.headline.trim(), email: !!m0.email.trim(), phone: !!m0.phone.trim(), doc: !!m0.docNumber.trim(),
    location: !!(m0.countryId || m0.city.trim()), linkedin: !!m0.linkedinUrl.trim(), summary: !!m0.summary.trim(),
    availability: !!m0.availabilityId, equipment: m0.hasEquipment !== '', rates: canRates ? hasRates(d.rates) : null,
    tech: d.tech.length > 0, soft: d.soft.length > 0, experience: d.exp.length > 0, education: d.edu.length > 0, languages: d.lang.length > 0,
  };

  const count = (n: number) => (n ? <span className="count">{n}</span> : null);
  const tabLabel: Record<Tab, ReactNode> = {
    data: t('talents.tabData'), skills: <>{t('talents.tabSkills')}{count(d.tech.length + d.soft.length)}</>,
    experience: <>{t('talents.experience')}{count(d.exp.length)}</>, education: <>{t('talents.educationTitle')}{count(d.edu.length)}</>,
    languages: <>{t('talents.languages')}{count(d.lang.length)}</>, feedback: t('talents.feedback'), files: <>{t('talents.files')}{count(d.files.length)}</>,
  };

  return (
    <Modal open wide persistent title={editing ? t('talents.edit') : t('talents.new')} onClose={onClose}
      tabs={<>
        <ProfileMeter facts={facts} />
        <div className="tabs" role="tablist">{TABS.map((k) => (
          <button key={k} role="tab" type="button" className="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{tabLabel[k]}</button>
        ))}</div>
      </>}
      footer={<>
        {progress && <span className="muted" role="status">{progress}</span>}
        <span className="spacer" />
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
        <Button onClick={save} loading={busy} disabled={!valid} data-testid="save-talent">{t('common.save')}</Button>
      </>}>
      {busy && <Loader variant="overlay" label={progress || t('common.savingDots')} />}
      {errors.length > 0 && <div className="alert alert-error" role="alert"><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      {tab === 'data' && <DataTab d={d} set={set} canRates={canRates} />}
      {tab === 'skills' && <SkillsTab d={d} set={set} />}
      {tab === 'experience' && <ExperienceTab d={d} set={set} />}
      {tab === 'education' && <EducationTab d={d} set={set} />}
      {tab === 'languages' && <LanguagesTab d={d} set={set} />}
      {tab === 'feedback' && <FeedbackTab d={d} set={set} />}
      {tab === 'files' && <FilesTab d={d} set={set} />}
    </Modal>
  );
}

type TabProps = { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void };

function DataTab({ d, set, canRates }: TabProps & { canRates: boolean }) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  const m = d.main;
  const f = (k: keyof Main) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set('main', { ...m, [k]: e.target.value });
  // al escribir un monto sin moneda se propone la moneda por defecto: la ficha siempre muestra la moneda
  const currencies = masters.byTable('CURRENCY');
  const defCurrency = (currencies.find((c) => c.code === 'PEN') ?? currencies[0])?.id;
  const r = (k: keyof Rates) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const next = { ...d.rates, [k]: e.target.value };
    if ((k === 'payrollMin' || k === 'payrollMax') && !next.payrollCurrencyId) next.payrollCurrencyId = defCurrency;
    if ((k === 'rxhMin' || k === 'rxhMax') && !next.rxhCurrencyId) next.rxhCurrencyId = defCurrency;
    set('rates', next);
  };
  const opts = (table: string) => masters.byTable(table).map((x) => <option key={x.id} value={x.id}>{label(x.label)}</option>);
  return (
    <div className="stack">
      <h4 className="muted">{t('talents.personal')}</h4>
      <div className="form-grid">
        <Field label={t('talents.firstName')} required maxLength={100} value={m.firstName} onChange={f('firstName')} />
        <Field label={t('talents.lastName')} required maxLength={100} value={m.lastName} onChange={f('lastName')} />
        <Field label={t('talents.secondLastName')} maxLength={100} value={m.secondLastName} onChange={f('secondLastName')} />
        <div className="field"><label htmlFor="ed-doctype">{t('talents.docType')}</label>
          <select id="ed-doctype" className="select" value={m.docTypeId} onChange={f('docTypeId')}><option value="">—</option>{opts('DOC_IDENTITY_TYPE')}</select></div>
        <Field label={t('talents.docNumber')} maxLength={30} value={m.docNumber} onChange={f('docNumber')} />
        <div className="field"><label htmlFor="ed-country">{t('talents.country')}</label>
          <select id="ed-country" className="select" value={m.countryId} onChange={f('countryId')}><option value="">—</option>{opts('COUNTRY')}</select></div>
        <Field label={t('talents.city')} maxLength={120} value={m.city} onChange={f('city')} />
      </div>
      <h4 className="muted">{t('talents.contact')}</h4>
      <div className="form-grid">
        <Field label={t('talents.email')} type="email" maxLength={254} value={m.email} onChange={f('email')} />
        <Field label={t('talents.phone')} type="tel" maxLength={30} value={m.phone} onChange={f('phone')} />
        <Field label={t('talents.linkedin')} type="url" placeholder="https://www.linkedin.com/in/..." value={m.linkedinUrl} onChange={f('linkedinUrl')} />
        <Field label={t('talents.github')} type="url" placeholder="https://github.com/..." value={m.githubUrl} onChange={f('githubUrl')} />
      </div>
      <h4 className="muted">{t('talents.profile')}</h4>
      <div className="form-grid">
        <Field label={t('talents.headline')} maxLength={150} value={m.headline} onChange={f('headline')} />
        <div className="field"><label htmlFor="ed-av">{t('talents.availability')}</label>
          <select id="ed-av" className="select" value={m.availabilityId} onChange={f('availabilityId')}><option value="">—</option>{opts('TALENT_AVAILABILITY')}</select></div>
        <div className="field"><label htmlFor="ed-eq">{t('talents.hasEquipment')}</label>
          <select id="ed-eq" className="select" value={m.hasEquipment} onChange={f('hasEquipment')}>
            <option value="">—</option><option value="yes">{t('talents.yes')}</option><option value="no">{t('talents.no')}</option></select></div>
      </div>
      <div className="field"><label htmlFor="ed-sum">{t('talents.summary')}</label>
        <textarea id="ed-sum" className="textarea" maxLength={5000} value={m.summary} onChange={f('summary')} /></div>
      {canRates && <>
        <h4 className="muted">{t('talents.rates')}</h4>
        <div className="form-grid">
          <div className="field"><label htmlFor="ed-mod">{t('talents.modality')}</label>
            <select id="ed-mod" className="select" value={d.rates.modalityId ?? ''} onChange={r('modalityId')}><option value="">—</option>{opts('BILLING_MODALITY')}</select></div>
          <Field label={`${t('talents.payroll')} · ${t('talents.min')}`} type="number" min={0} value={d.rates.payrollMin ?? ''} onChange={r('payrollMin')} />
          <Field label={`${t('talents.payroll')} · ${t('talents.max')}`} type="number" min={0} value={d.rates.payrollMax ?? ''} onChange={r('payrollMax')} />
          <div className="field"><label htmlFor="ed-pc">{`${t('talents.payroll')} · ${t('talents.currency')}`}</label>
            <select id="ed-pc" className="select" value={d.rates.payrollCurrencyId ?? ''} onChange={r('payrollCurrencyId')}><option value="">—</option>{opts('CURRENCY')}</select></div>
          <Field label={`${t('talents.rxh')} · ${t('talents.min')}`} type="number" min={0} value={d.rates.rxhMin ?? ''} onChange={r('rxhMin')} />
          <Field label={`${t('talents.rxh')} · ${t('talents.max')}`} type="number" min={0} value={d.rates.rxhMax ?? ''} onChange={r('rxhMax')} />
          <div className="field"><label htmlFor="ed-rc">{`${t('talents.rxh')} · ${t('talents.currency')}`}</label>
            <select id="ed-rc" className="select" value={d.rates.rxhCurrencyId ?? ''} onChange={r('rxhCurrencyId')}><option value="">—</option>{opts('CURRENCY')}</select></div>
          <Field label={t('talents.notes')} maxLength={300} value={d.rates.notes ?? ''} onChange={r('notes')} />
        </div>
      </>}
    </div>
  );
}

function SkillsTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  const [tech, setTech] = useState('');
  const [years, setYears] = useState('1');
  const [soft, setSoft] = useState('');
  const techOpts = masters.byTable('TECH_SKILL');
  const softOpts = masters.byTable('SOFT_SKILL');
  const addTech = () => {
    const name = tech.trim();
    if (!name) return;
    const match = techOpts.find((o) => label(o.label).toLowerCase() === name.toLowerCase());
    const existing = d.tech.find((s) => (match && s.skillId === match.id) || s.label.toLowerCase() === name.toLowerCase());
    const y = Math.min(60, Math.max(0, Number(years) || 0));
    if (existing) set('tech', d.tech.map((s) => (s === existing ? { ...s, years: y } : s)));
    else set('tech', [...d.tech, { id: uid(), skillId: match?.id, label: match ? label(match.label) : name, years: y }]);
    setTech(''); setYears('1');
  };
  const addSoft = () => {
    const name = soft.trim();
    if (!name || d.soft.some((s) => s.label.toLowerCase() === name.toLowerCase())) { setSoft(''); return; }
    const match = softOpts.find((o) => label(o.label).toLowerCase() === name.toLowerCase());
    set('soft', [...d.soft, { id: uid(), skillId: match?.id, label: match ? label(match.label) : name }]);
    setSoft('');
  };
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="ed-tech">{t('talents.skills')}</label>
          <input id="ed-tech" className="input" list="ed-dl-tech" placeholder={t('talents.skillPlaceholder')} value={tech} maxLength={100}
            onChange={(e) => setTech(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTech(); } }} />
          <datalist id="ed-dl-tech">{techOpts.map((o) => <option key={o.id} value={label(o.label)} />)}</datalist>
        </div>
        <div className="field" style={{ width: 100 }}>
          <label htmlFor="ed-years">{t('talents.yearsShort')}</label>
          <input id="ed-years" className="input" type="number" min={0} max={60} step={0.5} value={years} onChange={(e) => setYears(e.target.value)} />
        </div>
        <Button type="button" variant="secondary" onClick={addTech} disabled={!tech.trim()} data-testid="add-tech">{t('talents.addSkill')}</Button>
      </div>
      <div className="chips">
        {d.tech.length === 0 && <span className="muted">{t('talents.empty')}</span>}
        {d.tech.map((s) => (
          <Chip key={s.id} onRemove={() => set('tech', d.tech.filter((x) => x.id !== s.id))} removeLabel={`${t('talents.delete')} ${s.label}`}>
            {s.label}
            <input type="number" min={0} max={60} step={0.5} value={s.years} aria-label={`${t('talents.yearsShort')} ${s.label}`} className="chip-years"
              onChange={(e) => set('tech', d.tech.map((x) => (x.id === s.id ? { ...x, years: Number(e.target.value) } : x)))} />
          </Chip>
        ))}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="ed-soft">{t('talents.softSkills')}</label>
          <input id="ed-soft" className="input" list="ed-dl-soft" placeholder={t('talents.skillPlaceholder')} value={soft} maxLength={100}
            onChange={(e) => setSoft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSoft(); } }} />
          <datalist id="ed-dl-soft">{softOpts.map((o) => <option key={o.id} value={label(o.label)} />)}</datalist>
        </div>
        <Button type="button" variant="secondary" onClick={addSoft} disabled={!soft.trim()} data-testid="add-soft">{t('talents.addSkill')}</Button>
      </div>
      <div className="chips">
        {d.soft.length === 0 && <span className="muted">{t('talents.empty')}</span>}
        {d.soft.map((s) => <Chip key={s.id} onRemove={() => set('soft', d.soft.filter((x) => x.id !== s.id))} removeLabel={`${t('talents.delete')} ${s.label}`}>{s.label}</Chip>)}
      </div>
    </div>
  );
}

/** Lista editable genérica: formulario arriba (agregar/actualizar) y filas abajo. */
function ListEditor<T extends { id: string }>({ items, onChange, empty, render, form, isValid, addLabel }: {
  items: T[]; onChange: (v: T[]) => void; empty: T; render: (x: T) => ReactNode; isValid: (x: T) => boolean; addLabel: string;
  form: (x: T, setX: (v: T) => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const [cur, setCur] = useState<T>({ ...empty, id: uid() });
  const editingExisting = items.some((i) => i.id === cur.id);
  const commit = () => {
    onChange(editingExisting ? items.map((i) => (i.id === cur.id ? cur : i)) : [...items, cur]);
    setCur({ ...empty, id: uid() });
  };
  return (
    <div className="stack">
      <div className="sub-form">
        {form(cur, setCur)}
        <div className="row">
          <Button type="button" variant="secondary" onClick={commit} disabled={!isValid(cur)} data-testid="list-add">{editingExisting ? t('common.save') : addLabel}</Button>
          {editingExisting && <Button type="button" variant="ghost" onClick={() => setCur({ ...empty, id: uid() })}>{t('common.cancel')}</Button>}
        </div>
      </div>
      <div className="item-list">
        {items.length === 0 && <p className="muted">{t('talents.empty')}</p>}
        {items.map((x) => (
          <div key={x.id} className="item-row" data-testid="draft-row">
            <div className="grow">{render(x)}</div>
            <Button size="sm" variant="ghost" type="button" onClick={() => setCur(x)}>{t('talents.edit').split(' ')[0]}</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => onChange(items.filter((i) => i.id !== x.id))}>{t('talents.delete')}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExperienceTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  return (
    <ListEditor<Exp> items={d.exp} onChange={(v) => set('exp', v)} addLabel={t('talents.addExperience')}
      empty={{ id: '', company: '', position: '', startDate: '', endDate: '', isCurrent: false, functions: '' }}
      isValid={(e) => !!(e.company.trim() && e.position.trim() && e.startDate && (e.isCurrent || e.endDate) && (!e.endDate || e.endDate >= e.startDate || e.isCurrent))}
      render={(e) => <><strong>{e.position}</strong> · {e.company}<div className="muted">{e.startDate.slice(0, 7)} — {e.isCurrent ? t('talents.present') : e.endDate.slice(0, 7)}</div></>}
      form={(e, s) => <>
        <div className="form-grid">
          <Field label={t('talents.company')} maxLength={150} value={e.company} onChange={(x) => s({ ...e, company: x.target.value })} />
          <Field label={t('talents.position')} maxLength={150} value={e.position} onChange={(x) => s({ ...e, position: x.target.value })} />
          <Field label={t('talents.start')} type="date" value={e.startDate} onChange={(x) => s({ ...e, startDate: x.target.value })} />
          {!e.isCurrent && <Field label={t('talents.end')} type="date" value={e.endDate} onChange={(x) => s({ ...e, endDate: x.target.value })} />}
        </div>
        <label className="checkbox"><input type="checkbox" checked={e.isCurrent} onChange={(x) => s({ ...e, isCurrent: x.target.checked })} />{t('talents.current')}</label>
        <div className="field"><label htmlFor="ed-fn">{t('talents.functions')}</label>
          <textarea id="ed-fn" className="textarea" maxLength={5000} value={e.functions} onChange={(x) => s({ ...e, functions: x.target.value })} /></div>
      </>} />
  );
}

function EducationTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  return (
    <ListEditor<Edu> items={d.edu} onChange={(v) => set('edu', v)} addLabel={t('talents.addEducation')}
      empty={{ id: '', institution: '', career: '', gradeId: '', startDate: '', endDate: '', isCurrent: false, datePrecision: 'MONTH' }}
      isValid={(e) => !!(e.institution.trim() && e.career.trim())}
      render={(e) => <><strong>{e.career}</strong> · {e.institution}<div className="muted">{label(masters.byTable('ACADEMIC_GRADE').find((g) => g.id === e.gradeId)?.label)}</div></>}
      form={(e, s) => <>
        <div className="form-grid">
          <Field label={t('talents.institution')} maxLength={150} value={e.institution} onChange={(x) => s({ ...e, institution: x.target.value })} />
          <Field label={t('talents.career')} maxLength={150} value={e.career} onChange={(x) => s({ ...e, career: x.target.value })} />
          <div className="field"><label htmlFor="ed-grade">{t('talents.grade')}</label>
            <select id="ed-grade" className="select" value={e.gradeId} onChange={(x) => s({ ...e, gradeId: x.target.value })}>
              <option value="">—</option>{masters.byTable('ACADEMIC_GRADE').map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}</select></div>
          <Field label={t('talents.start')} type="date" value={e.startDate} onChange={(x) => s({ ...e, startDate: x.target.value })} />
          {!e.isCurrent && <Field label={t('talents.end')} type="date" value={e.endDate} onChange={(x) => s({ ...e, endDate: x.target.value })} />}
        </div>
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={e.isCurrent} onChange={(x) => s({ ...e, isCurrent: x.target.checked })} />{t('talents.current')}</label>
          <label className="checkbox"><input type="checkbox" checked={e.datePrecision === 'YEAR'} onChange={(x) => s({ ...e, datePrecision: x.target.checked ? 'YEAR' : 'MONTH' })} />{t('talents.yearOnly')}</label>
        </div>
      </>} />
  );
}

function LanguagesTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  const levels = masters.byTable('LANGUAGE_LEVEL');
  const langs = masters.byTable('LANGUAGE');
  return (
    <ListEditor<Lang> items={d.lang} onChange={(v) => set('lang', v)} addLabel={t('talents.addLanguage')}
      empty={{ id: '', languageId: '', levelId: '', stars: 0 }}
      isValid={(l) => !!(l.languageId && l.levelId)}
      render={(l) => <><strong>{label(langs.find((x) => x.id === l.languageId)?.label)}</strong> · {label(levels.find((x) => x.id === l.levelId)?.label)} <Stars value={l.stars} size={13} /></>}
      form={(l, s) => (
        <div className="form-grid">
          <div className="field"><label htmlFor="ed-lang">{t('talents.language')}</label>
            <select id="ed-lang" className="select" value={l.languageId} onChange={(x) => s({ ...l, languageId: x.target.value })}>
              <option value="">—</option>{langs.map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}</select></div>
          <div className="field"><label htmlFor="ed-level">{t('talents.level')}</label>
            <select id="ed-level" className="select" value={l.levelId}
              onChange={(x) => { const lv = levels.find((v) => v.id === x.target.value); s({ ...l, levelId: x.target.value, stars: lv ? lv.sortOrder : l.stars }); }}>
              <option value="">—</option>{levels.map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}</select></div>
          <div className="field"><span>{t('talents.stars')}</span><Stars value={l.stars} onChange={(n) => s({ ...l, stars: n })} label={t('talents.stars')} /></div>
        </div>
      )} />
  );
}

function FeedbackTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <p className="muted">{t('talents.feedbackHint')}</p>
      <div className="field"><span>{t('talents.rating')}</span><Stars value={d.feedback.stars} onChange={(n) => set('feedback', { ...d.feedback, stars: n })} label={t('talents.rating')} /></div>
      <div className="field"><label htmlFor="ed-fb">{t('talents.comment')}</label>
        <textarea id="ed-fb" className="textarea" maxLength={5000} value={d.feedback.comment} onChange={(e) => set('feedback', { ...d.feedback, comment: e.target.value })} /></div>
    </div>
  );
}

const CATEGORIES = ['CV', 'PHOTO', 'CV_TENANT_ES', 'CV_TENANT_EN', 'CERTIFICATE', 'OTHER'];

function FilesTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState('CV');
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ width: 240 }}>
          <label htmlFor="ed-cat">{t('talents.category')}</label>
          <select id="ed-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`talents.categories.${c}`)}</option>)}</select>
        </div>
        <label className="btn btn-secondary">
          {t('talents.upload')}
          <input type="file" hidden data-testid="editor-file-input" accept={category === 'PHOTO' ? 'image/png,image/jpeg,image/webp' : '.pdf,.doc,.docx,image/png,image/jpeg'}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) set('files', [...d.files.filter((x) => !(category === 'PHOTO' && x.category === 'PHOTO')), { id: uid(), category, file: f }]); }} />
        </label>
        <span className="muted" style={{ fontSize: 12 }}>{t('talents.fileHint')}</span>
      </div>
      <div className="item-list">
        {d.files.length === 0 && <p className="muted">{t('talents.empty')}</p>}
        {d.files.map((f) => (
          <div key={f.id} className="item-row">
            <div className="grow"><strong>{f.file.name}</strong> · {t(`talents.categories.${f.category}`)} <span className="muted">({Math.ceil(f.file.size / 1024)} KB)</span></div>
            <Button size="sm" variant="ghost" type="button" onClick={() => set('files', d.files.filter((x) => x.id !== f.id))}>{t('talents.delete')}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
