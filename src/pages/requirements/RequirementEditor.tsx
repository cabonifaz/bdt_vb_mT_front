// Alta y edición de un requerimiento en modal con pestañas: Datos, Vacantes (perfil, cantidad, tarifas, skills y carreras),
// Contactos del cliente y Banda salarial por modalidad de contrato (solo con rq.rates.read).
// Código autogenerado por defecto (RQ-AAAA-0001); cada vacante tiene uuid propio (guardar es idempotente).
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { useLabel } from '../../lib/talents';
import { todayISO } from '../../lib/modules';
import { RQ_API, useClientContacts, useRqCatalogs, type RQDetail } from '../../lib/requirements';
import { Button, Field, Modal, useErrorText } from '../../components/ui';
import { SearchSelect, type SearchOption } from '../../components/ui/SearchSelect';
import { Chip } from '../../components/talents/bits';
import { Loader } from '../../components/ui/Loader';
import { useToast } from '../../components/ui/Toast';

type Skill = { skillId: string; label: string; years: string; optional: boolean };
type Career = { career: string; gradeId: string; optional: boolean };
type Vac = { id: string; profileId: string; quantity: string; rateInitial: string; rateFinal: string; skills: Skill[]; careers: Career[] };
type Bill = { contractId: string; currencyId: string } & Record<BandKey, string>;
type BandKey = `${'base' | 'mobility' | 'monthly' | 'quarterly' | 'semiannual'}${'Min' | 'Max'}`;
type Draft = {
  autoCode: boolean; code: string; clientId: string; title: string; description: string; statusId: string; requestDate: string; dueDate: string;
  durationValue: string; durationUnitId: string; contractValue: string; contractUnitId: string; workModalityId: string; ownerId: string; ownerLabel: string;
  needsEmo: boolean; needsSctr: boolean; needsLaptop: boolean; contacts: string[]; billing: Bill[]; vacancies: Vac[];
};
const BANDS = ['base', 'mobility', 'monthly', 'quarterly', 'semiannual'] as const;
const uid = () => crypto.randomUUID();
const s = (n?: number | null) => (n === undefined || n === null ? '' : String(n));
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const plusDays = (iso: string, d: number) => { const x = new Date(`${iso}T12:00:00`); x.setDate(x.getDate() + d); return todayISO(x); };

function fromDetail(rq: RQDetail | undefined, defaults: { statusId: string; contractUnitId: string }, label: (l?: Record<string, string>) => string): Draft {
  const today = todayISO();
  return {
    autoCode: !rq, code: rq?.code ?? '', clientId: rq?.client.id ?? '', title: rq?.title ?? '', description: rq?.description ?? '',
    statusId: rq?.status.id ?? defaults.statusId, requestDate: rq?.requestDate ?? today, dueDate: rq?.dueDate ?? plusDays(today, 15),
    durationValue: s(rq?.durationValue), durationUnitId: rq?.durationUnitId ?? '', contractValue: s(rq?.contractValue),
    contractUnitId: rq?.contractUnitId ?? (rq ? '' : defaults.contractUnitId), workModalityId: rq?.workModalityId ?? '',
    ownerId: rq?.ownerId ?? '', ownerLabel: rq?.ownerName ?? '', needsEmo: !!rq?.needsEmo, needsSctr: !!rq?.needsSctr, needsLaptop: !!rq?.needsLaptop,
    contacts: rq?.contacts.map((c) => c.id) ?? [],
    billing: (rq?.billing ?? []).map((b) => ({ contractId: b.contractId, currencyId: b.currencyId,
      ...Object.fromEntries(BANDS.flatMap((k) => [[`${k}Min`, s(b[`${k}Min`])], [`${k}Max`, s(b[`${k}Max`])]])) } as Bill)),
    vacancies: (rq?.vacancies ?? []).map((v) => ({ id: v.id, profileId: v.profileId, quantity: String(v.quantity), rateInitial: s(v.rateInitial), rateFinal: s(v.rateFinal),
      skills: v.skills.map((k) => ({ skillId: k.skillId, label: label(k.label), years: s(k.years), optional: k.optional })),
      careers: v.careers.map((c) => ({ career: c.career, gradeId: c.gradeId ?? '', optional: c.optional })) })),
  };
}

const TABS = ['data', 'vacancies', 'contacts', 'billing'] as const;
type Tab = (typeof TABS)[number];

export function RequirementEditor({ rq, onClose, onSaved }: { rq?: RQDetail; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const { can } = useAuth();
  const toast = useToast();
  const errText = useErrorText();
  const qc = useQueryClient();
  const cat = useRqCatalogs();
  const canRates = rq ? rq.canSeeRates : can('rq.rates.read');
  const [id] = useState(rq?.id ?? uid());
  const [tab, setTab] = useState<Tab>('data');
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // el borrador se arma cuando llegan los catálogos (estado y unidad por defecto)
  const draft = useMemo(() => d ?? (cat.data ? fromDetail(rq, { statusId: cat.byCode('RQ_STATUS', 'REGISTERED')?.id ?? '', contractUnitId: cat.byCode('TIME_UNIT', 'MONTHS')?.id ?? '' }, label) : null),
    [d, cat.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...(cur ?? draft!), [k]: v }));

  const problems = (x: Draft) => {
    const p: string[] = [];
    if (!x.clientId) p.push(t('rq.err.client'));
    if (!x.title.trim()) p.push(t('rq.err.title'));
    if (!x.autoCode && !/^[A-Za-z0-9._/-]{1,40}$/.test(x.code.trim())) p.push(t('rq.err.code'));
    if (!x.requestDate || !x.dueDate || x.dueDate < x.requestDate) p.push(t('rq.err.dates'));
    if (x.vacancies.length === 0) p.push(t('rq.err.noVacancies'));
    if (x.vacancies.some((v) => !v.profileId || !(Number(v.quantity) >= 1))) p.push(t('rq.err.vacancy'));
    if (x.vacancies.some((v) => v.rateInitial && v.rateFinal && Number(v.rateFinal) < Number(v.rateInitial))) p.push(t('rq.err.rate'));
    if (x.billing.some((b) => !b.currencyId || BANDS.some((k) => b[`${k}Min`] && b[`${k}Max`] && Number(b[`${k}Max`]) < Number(b[`${k}Min`])))) p.push(t('rq.err.band'));
    return p;
  };

  const save = async () => {
    if (!draft) return;
    const p = problems(draft);
    if (p.length) { setErrors(p); return; }
    setBusy(true); setErrors([]);
    const body = {
      code: draft.autoCode ? '' : draft.code.trim(), clientId: draft.clientId, title: draft.title.trim(), description: draft.description.trim(),
      statusId: draft.statusId, requestDate: draft.requestDate, dueDate: draft.dueDate,
      durationValue: num(draft.durationValue), durationUnitId: draft.durationValue ? draft.durationUnitId || null : null,
      contractValue: num(draft.contractValue), contractUnitId: draft.contractValue ? draft.contractUnitId || null : null,
      workModalityId: draft.workModalityId || null, ownerId: draft.ownerId || null,
      needsEmo: draft.needsEmo, needsSctr: draft.needsSctr, needsLaptop: draft.needsLaptop, contacts: draft.contacts,
      billing: canRates ? draft.billing.map((b) => ({ contractId: b.contractId, currencyId: b.currencyId, ...Object.fromEntries(BANDS.flatMap((k) => [[`${k}Min`, num(b[`${k}Min`])], [`${k}Max`, num(b[`${k}Max`])]])) })) : null,
      vacancies: draft.vacancies.map((v) => ({ id: v.id, profileId: v.profileId, quantity: Number(v.quantity),
        rateInitial: canRates ? num(v.rateInitial) : null, rateFinal: canRates ? num(v.rateFinal) : null,
        skills: v.skills.map((k) => ({ skillId: k.skillId, years: num(k.years), optional: k.optional })),
        careers: v.careers.filter((c) => c.career.trim()).map((c) => ({ career: c.career.trim(), gradeId: c.gradeId || null, optional: c.optional })) })),
      expectedVersion: rq?.version,
    };
    try {
      await http.put(`${RQ_API}/${id}`, body);
      void qc.invalidateQueries({ queryKey: ['rq', id] });
      void qc.invalidateQueries({ queryKey: ['rq-board'] });
      toast.success(rq ? t('rq.updated') : t('rq.created'));
      onSaved(id);
    } catch (e) {
      setErrors([e instanceof ApiError ? errText(e) : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const count = (n: number) => (n ? <span className="count">{n}</span> : null);
  const tabs = TABS.filter((k) => k !== 'billing' || canRates);
  const tabLabel: Record<Tab, ReactNode> = {
    data: t('rq.tab.data'), vacancies: <>{t('rq.tab.vacancies')}{count(draft?.vacancies.length ?? 0)}</>,
    contacts: <>{t('rq.tab.contacts')}{count(draft?.contacts.length ?? 0)}</>, billing: <>{t('rq.tab.billing')}{count(draft?.billing.length ?? 0)}</>,
  };
  return (
    <Modal open wide persistent title={rq ? t('rq.editTitle', { code: rq.code }) : t('rq.new')} onClose={onClose}
      tabs={<div className="tabs" role="tablist">{tabs.map((k) => (
        <button key={k} role="tab" type="button" className="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`rq-tab-${k}`}>{tabLabel[k]}</button>
      ))}</div>}
      footer={<>
        <span className="spacer" />
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
        <Button onClick={save} loading={busy} disabled={!draft} data-testid="rq-save">{t('common.save')}</Button>
      </>}>
      {busy && <Loader variant="overlay" label={t('common.savingDots')} />}
      {errors.length > 0 && <div className="alert alert-error" role="alert"><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      {!draft ? <Loader /> : <>
        {tab === 'data' && <DataTab d={draft} set={set} />}
        {tab === 'vacancies' && <VacanciesTab d={draft} set={set} canRates={canRates} />}
        {tab === 'contacts' && <ContactsTab d={draft} set={set} />}
        {tab === 'billing' && canRates && <BillingTab d={draft} set={set} />}
      </>}
    </Modal>
  );
}

type TabProps = { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void };

function DataTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  const label = useLabel();
  const cat = useRqCatalogs();
  const opts = (table: string) => cat.byTable(table).map((x) => <option key={x.id} value={x.id}>{label(x.label)}</option>);
  const f = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value as never);
  const searchUsers = useCallback(async (q: string): Promise<SearchOption[]> => {
    const list = await http.get<{ id: string; name: string; email: string }[]>(`/api/v1/tenant/colleagues?q=${encodeURIComponent(q.trim())}`);
    return list.map((c) => ({ value: c.id, label: c.name, hint: c.email }));
  }, []);
  return (
    <div className="stack">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="rq-code">{t('rq.code')}</label>
          <input id="rq-code" className="input" maxLength={40} value={d.autoCode ? t('rq.autoCode') : d.code} disabled={d.autoCode} onChange={f('code')} />
          <label className="checkbox" style={{ marginTop: 4 }}><input type="checkbox" checked={d.autoCode} onChange={(e) => set('autoCode', e.target.checked)} />{t('rq.autoCodeLabel')}</label>
        </div>
        <SearchSelect id="rq-client" label={t('rq.client')} value={d.clientId} placeholder={t('blacklist.searchClient')} testId="rq-client"
          onChange={(v) => setD2(v)} options={cat.byTable('CLIENT').map((c) => ({ value: c.id, label: label(c.label) }))} />
        <div className="field"><label htmlFor="rq-status">{t('rq.status')}</label>
          <select id="rq-status" className="select" value={d.statusId} onChange={f('statusId')}>{opts('RQ_STATUS')}</select></div>
        <SearchSelect id="rq-owner" label={t('rq.owner')} value={d.ownerId} selectedLabel={d.ownerLabel || undefined} placeholder={t('rq.ownerPlaceholder')} minChars={2}
          emptyLabel={t('rq.ownerMe')} load={searchUsers} onChange={(v, o) => { set('ownerId', v); if (o) set('ownerLabel', o.label); }} />
      </div>
      <Field label={t('rq.titleField')} required maxLength={200} value={d.title} onChange={f('title')} />
      <div className="field"><label htmlFor="rq-desc">{t('rq.description')}</label>
        <textarea id="rq-desc" className="textarea" maxLength={2000} value={d.description} onChange={f('description')} /></div>
      <div className="form-grid">
        <Field label={t('rq.requestDate')} type="date" value={d.requestDate} onChange={f('requestDate')} />
        <Field label={t('rq.dueDate')} type="date" min={d.requestDate} value={d.dueDate} onChange={f('dueDate')} />
        <div className="field"><label htmlFor="rq-mod">{t('rq.workModality')}</label>
          <select id="rq-mod" className="select" value={d.workModalityId} onChange={f('workModalityId')}><option value="">—</option>{opts('WORK_MODALITY')}</select></div>
        <div className="field"><label htmlFor="rq-cv">{t('rq.contractDuration')}</label>
          <div className="input-pair">
            <input id="rq-cv" className="input" type="number" min={0} step={1} value={d.contractValue} onChange={f('contractValue')} />
            <select className="select" aria-label={t('rq.unit')} value={d.contractUnitId} onChange={f('contractUnitId')}><option value="">—</option>{opts('TIME_UNIT')}</select>
          </div></div>
        <div className="field"><label htmlFor="rq-dv">{t('rq.serviceDuration')}</label>
          <div className="input-pair">
            <input id="rq-dv" className="input" type="number" min={0} step={1} value={d.durationValue} onChange={f('durationValue')} />
            <select className="select" aria-label={t('rq.unit')} value={d.durationUnitId} onChange={f('durationUnitId')}><option value="">—</option>{opts('TIME_UNIT')}</select>
          </div></div>
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <label className="checkbox"><input type="checkbox" checked={d.needsEmo} onChange={(e) => set('needsEmo', e.target.checked)} />{t('rq.needsEmo')}</label>
        <label className="checkbox"><input type="checkbox" checked={d.needsSctr} onChange={(e) => set('needsSctr', e.target.checked)} />{t('rq.needsSctr')}</label>
        <label className="checkbox"><input type="checkbox" checked={d.needsLaptop} onChange={(e) => set('needsLaptop', e.target.checked)} />{t('rq.needsLaptop')}</label>
      </div>
    </div>
  );
  // al cambiar de cliente se quitan los contactos del cliente anterior
  function setD2(v: string) { if (v !== d.clientId) { set('clientId', v); set('contacts', []); } }
}

function VacanciesTab({ d, set, canRates }: TabProps & { canRates: boolean }) {
  const { t } = useTranslation();
  const label = useLabel();
  const cat = useRqCatalogs();
  const [open, setOpen] = useState<string | null>(d.vacancies.length ? null : 'new');
  const add = () => {
    const v: Vac = { id: uid(), profileId: '', quantity: '1', rateInitial: '', rateFinal: '', skills: [], careers: [] };
    set('vacancies', [...d.vacancies, v]);
    setOpen(v.id);
  };
  const upd = (id: string, patch: Partial<Vac>) => set('vacancies', d.vacancies.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const profileLabel = (id: string) => label(cat.byTable('RQ_PROFILE').find((p) => p.id === id)?.label) || t('rq.noProfile');
  return (
    <div className="stack">
      <div><Button variant="secondary" size="sm" onClick={add} data-testid="rq-add-vacancy"><Plus size={15} />{t('rq.addVacancy')}</Button></div>
      {d.vacancies.length === 0 && <p className="muted">{t('rq.noVacancies')}</p>}
      <div className="item-list">
        {d.vacancies.map((v) => {
          const isOpen = open === v.id || (open === 'new' && v === d.vacancies[d.vacancies.length - 1]);
          return (
            <div key={v.id} className={`acc-item${isOpen ? ' open' : ''}`} data-testid="rq-vacancy">
              <div className="item-row">
                <div className="grow"><strong>{profileLabel(v.profileId)}</strong> · {t('rq.quantityShort', { count: Number(v.quantity) || 0 })}
                  <div className="muted">{t('rq.skillsCount', { count: v.skills.length })}{v.careers.length ? ` · ${t('rq.careersCount', { count: v.careers.length })}` : ''}</div></div>
                <Button size="sm" variant="ghost" type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : v.id)}>{isOpen ? t('common.close') : t('talents.edit').split(' ')[0]}</Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => set('vacancies', d.vacancies.filter((x) => x.id !== v.id))} aria-label={t('rq.removeVacancy')}><Trash2 size={15} /></Button>
              </div>
              {isOpen && <VacancyForm v={v} upd={(p) => upd(v.id, p)} canRates={canRates} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VacancyForm({ v, upd, canRates }: { v: Vac; upd: (p: Partial<Vac>) => void; canRates: boolean }) {
  const { t } = useTranslation();
  const label = useLabel();
  const cat = useRqCatalogs();
  const [skill, setSkill] = useState('');
  const [years, setYears] = useState('');
  const skills = cat.byTable('TECH_SKILL');
  const addSkill = () => {
    const match = skills.find((x) => label(x.label).toLowerCase() === skill.trim().toLowerCase());
    if (!match || v.skills.some((k) => k.skillId === match.id)) { setSkill(''); return; }
    upd({ skills: [...v.skills, { skillId: match.id, label: label(match.label), years, optional: false }] });
    setSkill(''); setYears('');
  };
  return (
    <div className="sub-form">
      <div className="form-grid">
        <div className="field"><label htmlFor={`vp-${v.id}`}>{t('rq.profile')}</label>
          <select id={`vp-${v.id}`} className="select" value={v.profileId} onChange={(e) => upd({ profileId: e.target.value })} data-testid="rq-vacancy-profile">
            <option value="">—</option>{cat.byTable('RQ_PROFILE').map((p) => <option key={p.id} value={p.id}>{label(p.label)}</option>)}</select></div>
        <Field label={t('rq.quantity')} type="number" min={1} max={500} value={v.quantity} onChange={(e) => upd({ quantity: e.target.value })} />
        {canRates && <Field label={t('rq.rateInitial')} type="number" min={0} step="0.01" value={v.rateInitial} onChange={(e) => upd({ rateInitial: e.target.value })} />}
        {canRates && <Field label={t('rq.rateFinal')} type="number" min={0} step="0.01" value={v.rateFinal} onChange={(e) => upd({ rateFinal: e.target.value })} />}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor={`vs-${v.id}`}>{t('rq.skills')}</label>
          <input id={`vs-${v.id}`} className="input" list={`vsl-${v.id}`} placeholder={t('talents.skillPlaceholder')} value={skill}
            onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} />
          <datalist id={`vsl-${v.id}`}>{skills.map((x) => <option key={x.id} value={label(x.label)} />)}</datalist>
        </div>
        <div className="field" style={{ width: 90 }}><label htmlFor={`vy-${v.id}`}>{t('talents.yearsShort')}</label>
          <input id={`vy-${v.id}`} className="input" type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} /></div>
        <Button type="button" variant="secondary" onClick={addSkill} disabled={!skill.trim()}>{t('talents.addSkill')}</Button>
      </div>
      <div className="chips">
        {v.skills.length === 0 && <span className="muted">{t('talents.empty')}</span>}
        {v.skills.map((k) => (
          <Chip key={k.skillId} onRemove={() => upd({ skills: v.skills.filter((x) => x.skillId !== k.skillId) })} removeLabel={`${t('talents.delete')} ${k.label}`}>
            {k.label}{k.years ? ` · ${k.years}a` : ''}
            <label className="chip-opt"><input type="checkbox" checked={k.optional} onChange={(e) => upd({ skills: v.skills.map((x) => (x.skillId === k.skillId ? { ...x, optional: e.target.checked } : x)) })} />{t('rq.optional')}</label>
          </Chip>
        ))}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{t('rq.careers')}</strong>
        {v.careers.map((c, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}><label htmlFor={`vc-${v.id}-${i}`}>{t('talents.career')}</label>
              <input id={`vc-${v.id}-${i}`} className="input" maxLength={150} value={c.career} onChange={(e) => upd({ careers: v.careers.map((x, j) => (j === i ? { ...x, career: e.target.value } : x)) })} /></div>
            <div className="field" style={{ width: 170 }}><label htmlFor={`vg-${v.id}-${i}`}>{t('talents.grade')}</label>
              <select id={`vg-${v.id}-${i}`} className="select" value={c.gradeId} onChange={(e) => upd({ careers: v.careers.map((x, j) => (j === i ? { ...x, gradeId: e.target.value } : x)) })}>
                <option value="">—</option>{cat.byTable('ACADEMIC_GRADE').map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}</select></div>
            <label className="checkbox"><input type="checkbox" checked={c.optional} onChange={(e) => upd({ careers: v.careers.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)) })} />{t('rq.optional')}</label>
            <Button size="sm" variant="ghost" type="button" onClick={() => upd({ careers: v.careers.filter((_, j) => j !== i) })} aria-label={t('talents.delete')}><Trash2 size={15} /></Button>
          </div>
        ))}
        <div><Button size="sm" variant="ghost" type="button" onClick={() => upd({ careers: [...v.careers, { career: '', gradeId: '', optional: false }] })}><Plus size={14} />{t('rq.addCareer')}</Button></div>
      </div>
    </div>
  );
}

function ContactsTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const errText = useErrorText();
  const contacts = useClientContacts(d.clientId);
  const [form, setForm] = useState<{ firstName: string; lastName: string; position: string; email: string; phone: string } | null>(null);
  if (!d.clientId) return <p className="muted">{t('rq.pickClientFirst')}</p>;
  const toggle = (id: string, on: boolean) => set('contacts', on ? [...d.contacts, id] : d.contacts.filter((x) => x !== id));
  const saveContact = async () => {
    if (!form) return;
    const id = uid();
    try {
      await http.put(`/api/v1/tenant/clients/${d.clientId}/contacts/${id}`, form);
      await contacts.refetch();
      set('contacts', [...d.contacts, id]);
      setForm(null);
    } catch (e) { toast.error(errText(e)); }
  };
  return (
    <div className="stack">
      {contacts.isLoading && <Loader />}
      {contacts.data?.length === 0 && <p className="muted">{t('rq.noContacts')}</p>}
      <div className="item-list">
        {contacts.data?.map((c) => (
          <label key={c.id} className="item-row checkbox" style={{ alignItems: 'center' }} data-testid="rq-contact">
            <input type="checkbox" checked={d.contacts.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
            <span className="grow"><strong>{[c.firstName, c.lastName, c.secondLastName].filter(Boolean).join(' ')}</strong>{c.position && ` · ${c.position}`}
              <span className="muted" style={{ display: 'block' }}>{[c.email, c.phone].filter(Boolean).join(' · ')}</span></span>
          </label>
        ))}
      </div>
      {can('rq.write') && (form ? (
        <div className="sub-form">
          <div className="form-grid">
            <Field label={t('talents.firstName')} required maxLength={100} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Field label={t('talents.lastName')} required maxLength={100} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Field label={t('rq.position')} maxLength={150} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            <Field label={t('talents.email')} type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Field label={t('talents.phone')} type="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="row">
            <Button size="sm" onClick={saveContact} disabled={!form.firstName.trim() || !form.lastName.trim()} data-testid="rq-contact-save">{t('common.save')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
          </div>
        </div>
      ) : <div><Button size="sm" variant="secondary" onClick={() => setForm({ firstName: '', lastName: '', position: '', email: '', phone: '' })} data-testid="rq-contact-new"><Plus size={15} />{t('rq.newContact')}</Button></div>)}
    </div>
  );
}

function BillingTab({ d, set }: TabProps) {
  const { t } = useTranslation();
  const label = useLabel();
  const cat = useRqCatalogs();
  const pen = cat.byCode('CURRENCY', 'PEN')?.id ?? cat.byTable('CURRENCY')[0]?.id ?? '';
  const modalities = cat.byTable('CONTRACT_MODALITY') as (ReturnType<typeof cat.byTable>[number] & { str1?: string })[];
  const empty = (contractId: string): Bill => ({ contractId, currencyId: pen, ...Object.fromEntries(BANDS.flatMap((k) => [[`${k}Min`, ''], [`${k}Max`, '']])) } as Bill);
  const upd = (contractId: string, patch: Partial<Bill>) => set('billing', d.billing.map((b) => (b.contractId === contractId ? { ...b, ...patch } : b)));
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>{t('rq.billingHint')}</p>
      {modalities.map((m) => {
        const b = d.billing.find((x) => x.contractId === m.id);
        const rxh = m.str1 === 'RXH';
        return (
          <div key={m.id} className={`acc-item${b ? ' open' : ''}`}>
            <label className="item-row checkbox" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={!!b} onChange={(e) => set('billing', e.target.checked ? [...d.billing, empty(m.id)] : d.billing.filter((x) => x.contractId !== m.id))} data-testid={`rq-billing-${m.code}`} />
              <span className="grow"><strong>{label(m.label)}</strong> <span className="muted">· {rxh ? t('rq.groupRxh') : t('rq.groupPayroll')}</span></span>
            </label>
            {b && (
              <div className="sub-form">
                <div className="field" style={{ maxWidth: 200 }}><label htmlFor={`bc-${m.id}`}>{t('talents.currency')}</label>
                  <select id={`bc-${m.id}`} className="select" value={b.currencyId} onChange={(e) => upd(m.id, { currencyId: e.target.value })}>
                    {cat.byTable('CURRENCY').map((c) => <option key={c.id} value={c.id}>{label(c.label)}</option>)}</select></div>
                <table className="table band-table">
                  <thead><tr><th>{t('rq.concept')}</th><th>{t('talents.min')}</th><th>{t('talents.max')}</th></tr></thead>
                  <tbody>{(rxh ? (['base'] as const) : BANDS).map((k) => (
                    <tr key={k}><td>{t(`rq.band.${k}`)}</td>
                      <td><input className="input" type="number" min={0} step="0.01" aria-label={`${t(`rq.band.${k}`)} ${t('talents.min')}`} value={b[`${k}Min`]} onChange={(e) => upd(m.id, { [`${k}Min`]: e.target.value } as Partial<Bill>)} /></td>
                      <td><input className="input" type="number" min={0} step="0.01" aria-label={`${t(`rq.band.${k}`)} ${t('talents.max')}`} value={b[`${k}Max`]} onChange={(e) => upd(m.id, { [`${k}Max`]: e.target.value } as Partial<Bill>)} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

