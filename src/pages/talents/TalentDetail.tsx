import { useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import {
  cachedGet, fetchFileBlob, fullName, TALENT_API, useLabel, useMasters, yearsLabel, type Collection, type Talent,
} from '../../lib/talents';
import { Button, Card, Field, Modal, StatusBadge, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Chip, Stars, TalentPhoto } from '../../components/talents/bits';
import { TalentEditor } from './TalentEditor';

const CATEGORIES = ['CV', 'CV_TENANT_ES', 'CV_TENANT_EN', 'CERTIFICATE', 'OTHER', 'PHOTO'];

export function TalentDetail() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const masters = useMasters();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const canWrite = can('talent.write');
  const q = useQuery({ queryKey: ['talent', id], queryFn: () => cachedGet<Talent>(`${TALENT_API}/${id}`) });
  const collections = useQuery({ queryKey: ['collections'], queryFn: () => cachedGet<Collection[]>('/api/v1/tenant/collections') });
  const [modal, setModal] = useState<null | 'editor' | 'experience' | 'education' | 'language' | 'feedback' | 'collection'>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['talent', id] });
    qc.invalidateQueries({ queryKey: ['talents'] });
  };
  /** Ejecuta una mutación (se encola si no hay red) y refresca la ficha. */
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      refresh();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OFFLINE') { toast.info(t('talents.savedOffline')); return true; }
      toast.error(errText(e));
      return false;
    }
  };

  if (q.isLoading) return <div className="page"><p className="muted">{t('common.loading')}</p></div>;
  if (q.isError || !q.data) return <div className="page"><div className="alert alert-error" role="alert">{errText(q.error)}</div></div>;
  const x = q.data;
  const name = fullName(x);
  const open = (m: typeof modal, item: Record<string, unknown> | null = null) => { setEditing(item); setModal(m); };
  const del = (section: string, itemId: string) => run(() => http.del(`${TALENT_API}/sections/${section}/${itemId}`));

  return (
    <div className="page">
      <Card>
        <div className="detail-header">
          <TalentPhoto fileId={x.photoId} name={name} size={88} />
          <div className="stack" style={{ gap: 4, flex: 1, minWidth: 240 }}>
            <div className="row"><h1 data-testid="talent-name">{name}</h1>{x.status === 'ARCHIVED' && <StatusBadge status="DISABLED" />}</div>
            {x.headline && <div style={{ fontSize: 16, fontWeight: 500 }}>{x.headline}</div>}
            <div className="row muted">
              {(x.city || x.country) && <span>{[x.city, label(x.country)].filter(Boolean).join(', ')}</span>}
              <Stars value={x.avgRating} /><span>{x.avgRating ? x.avgRating.toFixed(1) : '—'}</span>
            </div>
          </div>
          <div className="row">
            <Button variant="secondary" onClick={() => open('collection')}>♥ {t('talents.addToCollection')}</Button>
            {x.cvId && <Button variant="secondary" onClick={async () => window.open(URL.createObjectURL(await fetchFileBlob(x.cvId!, true)), '_blank', 'noopener')}>{t('talents.viewCv')}</Button>}
            {canWrite && <Button onClick={() => open('editor')} data-testid="edit-talent">{t('talents.edit')}</Button>}
            {canWrite && <Button variant="ghost" onClick={() => run(() => http.patch(`${TALENT_API}/${id}/status`, { status: x.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' }))}>
              {x.status === 'ACTIVE' ? t('talents.archive') : t('talents.activate')}</Button>}
          </div>
        </div>
      </Card>

      <div className="detail-grid">
        <Card title={t('talents.contact')}>
          <dl className="kv">
            <dt>{t('talents.email')}</dt><dd>{x.email || '—'}</dd>
            <dt>{t('talents.phone')}</dt><dd>{x.phone || '—'}</dd>
            <dt>{t('talents.docNumber')}</dt><dd>{x.docNumber ? `${label(masters.byTable('DOC_IDENTITY_TYPE').find((d) => d.id === x.docTypeId)?.label)} ${x.docNumber}` : '—'}</dd>
            <dt>{t('talents.linkedin')}</dt><dd>{x.linkedinUrl ? <a href={x.linkedinUrl} target="_blank" rel="noopener noreferrer">{x.linkedinUrl}</a> : '—'}</dd>
            <dt>{t('talents.github')}</dt><dd>{x.githubUrl ? <a href={x.githubUrl} target="_blank" rel="noopener noreferrer">{x.githubUrl}</a> : '—'}</dd>
            <dt>{t('talents.availability')}</dt><dd>{x.availability || '—'}</dd>
            <dt>{t('talents.hasEquipment')}</dt><dd>{x.hasEquipment === undefined || x.hasEquipment === null ? '—' : x.hasEquipment ? t('talents.yes') : t('talents.no')}</dd>
          </dl>
        </Card>

        <Card title={t('talents.rates')}>
          {!x.canSeeRates ? <p className="muted">{t('talents.ratesHidden')}</p> : x.rates ? (
            <dl className="kv" data-testid="rates">
              <dt>{t('talents.modality')}</dt><dd>{label(masters.byTable('BILLING_MODALITY').find((m) => m.id === x.rates?.modalityId)?.label) || '—'}</dd>
              <dt>{t('talents.payroll')}</dt><dd>{money(x.rates.payrollMin, x.rates.payrollMax, masters.byTable('CURRENCY').find((c) => c.id === x.rates?.payrollCurrencyId)?.code)}</dd>
              <dt>{t('talents.rxh')}</dt><dd>{money(x.rates.rxhMin, x.rates.rxhMax, masters.byTable('CURRENCY').find((c) => c.id === x.rates?.rxhCurrencyId)?.code)}</dd>
              {x.rates.notes && <><dt>{t('talents.notes')}</dt><dd>{x.rates.notes}</dd></>}
            </dl>
          ) : <p className="muted">{t('talents.empty')}</p>}
        </Card>

        {x.summary && <div className="span-2"><Card title={t('talents.summary')}><p className="pre">{x.summary}</p></Card></div>}

        <SkillsCard title={t('talents.skills')} table="TECH_SKILL" withYears canWrite={canWrite}
          items={x.techSkills.map((s) => ({ id: s.id, name: label(s.label), years: s.years }))}
          onAdd={(skill, years) => run(() => http.put(`${TALENT_API}/${id}/tech-skills`, { id: crypto.randomUUID(), ...skill, years }, true))}
          onRemove={(sid) => del('tech-skills', sid)} />
        <SkillsCard title={t('talents.softSkills')} table="SOFT_SKILL" canWrite={canWrite}
          items={x.softSkills.map((s) => ({ id: s.id, name: label(s.label) }))}
          onAdd={(skill) => run(() => http.post(`${TALENT_API}/${id}/soft-skills`, { id: crypto.randomUUID(), ...skill }, true))}
          onRemove={(sid) => del('soft-skills', sid)} />

        <div className="span-2">
          <Card title={t('talents.experience')} actions={canWrite && <Button size="sm" variant="secondary" onClick={() => open('experience')}>{t('talents.addExperience')}</Button>}>
            <div className="item-list">
              {x.experiences.length === 0 && <p className="muted">{t('talents.empty')}</p>}
              {x.experiences.map((e) => (
                <div key={e.id} className="item-row" data-testid="experience-row">
                  <div className="grow">
                    <strong>{e.position}</strong> · {e.company}
                    <div className="muted">{e.startDate.slice(0, 7)} — {e.isCurrent ? t('talents.present') : e.endDate?.slice(0, 7)} · {yearsLabel(e.months, t)}</div>
                    {e.functions && <p className="pre" style={{ marginTop: 6 }}>{e.functions}</p>}
                  </div>
                  {canWrite && <RowActions onEdit={() => open('experience', e)} onDelete={() => del('experiences', e.id)} />}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card title={t('talents.educationTitle')} actions={canWrite && <Button size="sm" variant="secondary" onClick={() => open('education')}>{t('talents.addEducation')}</Button>}>
          <div className="item-list">
            {x.educations.length === 0 && <p className="muted">{t('talents.empty')}</p>}
            {x.educations.map((d) => (
              <div key={d.id} className="item-row">
                <div className="grow">
                  <strong>{d.career}</strong>{d.grade && <> · {label(d.grade)}</>}
                  <div className="muted">{d.institution}</div>
                  <div className="muted">{fmtEdu(d.startDate, d.datePrecision)} — {d.isCurrent ? t('talents.present') : fmtEdu(d.endDate, d.datePrecision)}</div>
                </div>
                {canWrite && <RowActions onEdit={() => open('education', d)} onDelete={() => del('educations', d.id)} />}
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('talents.languages')} actions={canWrite && <Button size="sm" variant="secondary" onClick={() => open('language')}>{t('talents.addLanguage')}</Button>}>
          <div className="item-list">
            {x.languages.length === 0 && <p className="muted">{t('talents.empty')}</p>}
            {x.languages.map((l) => (
              <div key={l.id} className="item-row">
                <div className="grow"><strong>{label(l.language)}</strong> · {label(l.level)} <Stars value={l.stars} size={13} /></div>
                {canWrite && <RowActions onEdit={() => open('language', l)} onDelete={() => del('languages', l.id)} />}
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('talents.feedback')} actions={<Button size="sm" variant="secondary" onClick={() => open('feedback')}>{t('talents.addFeedback')}</Button>}>
          <div className="item-list">
            {x.feedback.length === 0 && <p className="muted">{t('talents.empty')}</p>}
            {x.feedback.map((f) => (
              <div key={f.id} className="item-row">
                <div className="grow">
                  <div className="row"><Stars value={f.stars} size={13} /><strong>{f.authorName}</strong><span className="muted">{formatDate(f.createdAt, i18n.language)}</span></div>
                  <p className="pre" style={{ marginTop: 4 }}>{f.comment}</p>
                </div>
                {(f.isMine || f.canDelete) && <RowActions onEdit={f.isMine ? () => open('feedback', f) : undefined}
                  onDelete={f.canDelete ? () => run(() => http.del(`${TALENT_API}/feedback/${f.id}`)) : undefined} />}
              </div>
            ))}
          </div>
        </Card>

        <FilesCard talent={x} canWrite={canWrite} onChanged={refresh} />
      </div>

      {modal === 'editor' && <TalentEditor talent={x} onClose={() => setModal(null)} onSaved={(_, offline) => {
        setModal(null);
        refresh();
        if (offline) toast.info(t('talents.savedOffline')); else toast.success(t('talents.saved'));
      }} />}
      {modal === 'experience' && <ExperienceModal item={editing} onClose={() => setModal(null)}
        onSave={(b) => run(() => http.put(`${TALENT_API}/${id}/experiences`, b, true), t('talents.saved'))} />}
      {modal === 'education' && <EducationModal item={editing} onClose={() => setModal(null)}
        onSave={(b) => run(() => http.put(`${TALENT_API}/${id}/educations`, b, true), t('talents.saved'))} />}
      {modal === 'language' && <LanguageModal item={editing} onClose={() => setModal(null)}
        onSave={(b) => run(() => http.put(`${TALENT_API}/${id}/languages`, b, true), t('talents.saved'))} />}
      {modal === 'feedback' && <FeedbackModal item={editing} onClose={() => setModal(null)}
        onSave={(b) => run(() => http.put(`${TALENT_API}/${id}/feedback`, b, true), t('talents.saved'))} />}
      {modal === 'collection' && <CollectionModal talent={x} collections={collections.data ?? []} onClose={() => setModal(null)}
        onChanged={() => { qc.invalidateQueries({ queryKey: ['collections'] }); refresh(); }} />}
    </div>
  );
}

function money(min?: number, max?: number, cur?: string) {
  if (min === undefined && max === undefined) return '—';
  const f = (n?: number) => (n === undefined ? '…' : n.toLocaleString());
  return `${cur ?? ''} ${f(min)} – ${f(max)}`.trim();
}

function fmtEdu(d?: string, precision?: string) {
  if (!d) return '—';
  return precision === 'YEAR' ? d.slice(0, 4) : d.slice(0, 7);
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="row" style={{ gap: 4, alignItems: 'flex-start' }}>
      {onEdit && <Button size="sm" variant="ghost" onClick={onEdit}>{t('talents.edit').split(' ')[0]}</Button>}
      {onDelete && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(t('talents.confirmDelete'))) onDelete(); }}>{t('talents.delete')}</Button>}
    </div>
  );
}

// ---------------------------------------------------------------- Habilidades
function SkillsCard({ title, table, items, withYears, canWrite, onAdd, onRemove }: {
  title: string; table: string; withYears?: boolean; canWrite: boolean;
  items: { id: string; name: string; years?: number }[];
  onAdd: (skill: { skillId?: string; label?: string }, years?: number) => Promise<boolean>; onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  const [text, setText] = useState('');
  const [years, setYears] = useState('1');
  const options = masters.byTable(table);
  const listId = `dl-${table}`;
  const add = async () => {
    if (!text.trim()) return;
    const match = options.find((o) => label(o.label).toLowerCase() === text.trim().toLowerCase());
    const ok = await onAdd(match ? { skillId: match.id } : { label: text.trim() }, withYears ? Number(years) : undefined);
    if (ok) { setText(''); setYears('1'); }
  };
  return (
    <Card title={title}>
      <div className="stack">
        <div className="chips">
          {items.length === 0 && <span className="muted">{t('talents.empty')}</span>}
          {items.map((s) => (
            <Chip key={s.id} onRemove={canWrite ? () => onRemove(s.id) : undefined} removeLabel={`${t('talents.delete')} ${s.name}`}>
              {s.name}{withYears && <small>{s.years}a</small>}
            </Chip>
          ))}
        </div>
        {canWrite && (
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor={`in-${table}`} className="sr-only">{title}</label>
              <input id={`in-${table}`} className="input" list={listId} placeholder={t('talents.skillPlaceholder')} value={text} maxLength={100}
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
              <datalist id={listId}>{options.map((o) => <option key={o.id} value={label(o.label)} />)}</datalist>
            </div>
            {withYears && <div className="field" style={{ width: 90 }}>
              <label htmlFor={`yr-${table}`} className="sr-only">{t('talents.yearsShort')}</label>
              <input id={`yr-${table}`} className="input" type="number" min={0} max={60} step={0.5} value={years} onChange={(e) => setYears(e.target.value)} aria-label={t('talents.yearsShort')} />
            </div>}
            <Button type="button" variant="secondary" onClick={add} disabled={!text.trim()}>{t('talents.addSkill')}</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Modales de secciones
function SectionModal({ title, onClose, onSubmit, children, valid = true }: {
  title: string; onClose: () => void; onSubmit: () => Promise<boolean>; children: ReactNode; valid?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Modal open title={title} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={busy} disabled={!valid} onClick={async () => { setBusy(true); const ok = await onSubmit(); setBusy(false); if (ok) onClose(); }}>{t('common.save')}</Button>
    </>}>{children}</Modal>
  );
}

type Rec = Record<string, unknown> | null;
const s = (v: unknown) => (typeof v === 'string' ? v : '');

function ExperienceModal({ item, onClose, onSave }: { item: Rec; onClose: () => void; onSave: (b: object) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [v, setV] = useState({ company: s(item?.company), position: s(item?.position), startDate: s(item?.startDate), endDate: s(item?.endDate),
    isCurrent: !!item?.isCurrent, functions: s(item?.functions) });
  return (
    <SectionModal title={t('talents.experience')} onClose={onClose} valid={!!(v.company && v.position && v.startDate && (v.isCurrent || v.endDate))}
      onSubmit={() => onSave({ id: s(item?.id) || crypto.randomUUID(), ...v, endDate: v.isCurrent ? null : v.endDate || null, functions: v.functions || null })}>
      <Field label={t('talents.company')} maxLength={150} value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />
      <Field label={t('talents.position')} maxLength={150} value={v.position} onChange={(e) => setV({ ...v, position: e.target.value })} />
      <div className="form-grid">
        <Field label={t('talents.start')} type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
        {!v.isCurrent && <Field label={t('talents.end')} type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />}
      </div>
      <label className="checkbox"><input type="checkbox" checked={v.isCurrent} onChange={(e) => setV({ ...v, isCurrent: e.target.checked })} />{t('talents.current')}</label>
      <div className="field"><label htmlFor="exp-fn">{t('talents.functions')}</label>
        <textarea id="exp-fn" className="textarea" maxLength={5000} value={v.functions} onChange={(e) => setV({ ...v, functions: e.target.value })} /></div>
    </SectionModal>
  );
}

function EducationModal({ item, onClose, onSave }: { item: Rec; onClose: () => void; onSave: (b: object) => Promise<boolean> }) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  const [v, setV] = useState({ institution: s(item?.institution), career: s(item?.career), gradeId: s(item?.gradeId), startDate: s(item?.startDate),
    endDate: s(item?.endDate), isCurrent: !!item?.isCurrent, datePrecision: s(item?.datePrecision) || 'MONTH' });
  return (
    <SectionModal title={t('talents.educationTitle')} onClose={onClose} valid={!!(v.institution && v.career)}
      onSubmit={() => onSave({ id: s(item?.id) || crypto.randomUUID(), ...v, gradeId: v.gradeId || null, startDate: v.startDate || null, endDate: v.isCurrent ? null : v.endDate || null })}>
      <Field label={t('talents.institution')} maxLength={150} value={v.institution} onChange={(e) => setV({ ...v, institution: e.target.value })} />
      <Field label={t('talents.career')} maxLength={150} value={v.career} onChange={(e) => setV({ ...v, career: e.target.value })} />
      <div className="field"><label htmlFor="edu-grade">{t('talents.grade')}</label>
        <select id="edu-grade" className="select" value={v.gradeId} onChange={(e) => setV({ ...v, gradeId: e.target.value })}>
          <option value="">—</option>{masters.byTable('ACADEMIC_GRADE').map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}
        </select></div>
      <div className="form-grid">
        <Field label={t('talents.start')} type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
        {!v.isCurrent && <Field label={t('talents.end')} type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />}
      </div>
      <label className="checkbox"><input type="checkbox" checked={v.isCurrent} onChange={(e) => setV({ ...v, isCurrent: e.target.checked })} />{t('talents.current')}</label>
      <label className="checkbox"><input type="checkbox" checked={v.datePrecision === 'YEAR'} onChange={(e) => setV({ ...v, datePrecision: e.target.checked ? 'YEAR' : 'MONTH' })} />{t('talents.yearOnly')}</label>
    </SectionModal>
  );
}

function LanguageModal({ item, onClose, onSave }: { item: Rec; onClose: () => void; onSave: (b: object) => Promise<boolean> }) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  const levels = masters.byTable('LANGUAGE_LEVEL');
  const [v, setV] = useState({ languageId: s(item?.languageId), levelId: s(item?.levelId), stars: Number(item?.stars ?? 0) });
  return (
    <SectionModal title={t('talents.languages')} onClose={onClose} valid={!!(v.languageId && v.levelId)}
      onSubmit={() => onSave({ id: s(item?.id) || crypto.randomUUID(), ...v })}>
      <div className="field"><label htmlFor="lg-lang">{t('talents.language')}</label>
        <select id="lg-lang" className="select" value={v.languageId} onChange={(e) => setV({ ...v, languageId: e.target.value })}>
          <option value="">—</option>{masters.byTable('LANGUAGE').map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}
        </select></div>
      <div className="field"><label htmlFor="lg-level">{t('talents.level')}</label>
        <select id="lg-level" className="select" value={v.levelId}
          onChange={(e) => { const lv = levels.find((l) => l.id === e.target.value); setV({ ...v, levelId: e.target.value, stars: lv ? lv.sortOrder : v.stars }); }}>
          <option value="">—</option>{levels.map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}
        </select></div>
      <div className="field"><span>{t('talents.stars')}</span><Stars value={v.stars} onChange={(n) => setV({ ...v, stars: n })} label={t('talents.stars')} /></div>
    </SectionModal>
  );
}

function FeedbackModal({ item, onClose, onSave }: { item: Rec; onClose: () => void; onSave: (b: object) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [v, setV] = useState({ stars: Number(item?.stars ?? 0), comment: s(item?.comment) });
  return (
    <SectionModal title={t('talents.feedback')} onClose={onClose} valid={v.stars > 0 && !!v.comment.trim()}
      onSubmit={() => onSave({ id: s(item?.id) || crypto.randomUUID(), ...v })}>
      <div className="field"><span>{t('talents.rating')}</span><Stars value={v.stars} onChange={(n) => setV({ ...v, stars: n })} label={t('talents.rating')} /></div>
      <div className="field"><label htmlFor="fb-c">{t('talents.comment')}</label>
        <textarea id="fb-c" className="textarea" maxLength={5000} value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} /></div>
    </SectionModal>
  );
}

function CollectionModal({ talent, collections, onClose, onChanged }: { talent: Talent; collections: Collection[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [name, setName] = useState('');
  const toggle = async (c: Collection, on: boolean) => {
    try {
      await (on ? http.put(`/api/v1/tenant/collections/${c.id}/talents/${talent.id}`) : http.del(`/api/v1/tenant/collections/${c.id}/talents/${talent.id}`));
      onChanged();
    } catch (e) { toast.error(errText(e)); }
  };
  const create = async () => {
    try {
      const id = crypto.randomUUID();
      await http.post('/api/v1/tenant/collections', { id, name });
      await http.put(`/api/v1/tenant/collections/${id}/talents/${talent.id}`);
      setName('');
      onChanged();
    } catch (e) { toast.error(errText(e)); }
  };
  return (
    <Modal open title={t('talents.addToCollection')} onClose={onClose} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="stack" style={{ gap: 8 }}>
        {collections.map((c) => (
          <label key={c.id} className="checkbox">
            <input type="checkbox" checked={talent.collections.includes(c.id)} onChange={(e) => toggle(c, e.target.checked)} />
            {c.name} <span className="muted">({c.talentCount})</span>
          </label>
        ))}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><Field label={t('talents.newCollection')} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button variant="secondary" disabled={!name.trim()} onClick={create}>{t('common.create')}</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Archivos
function FilesCard({ talent, canWrite, onChanged }: { talent: Talent; canWrite: boolean; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [category, setCategory] = useState('CV');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      await http.post(`${TALENT_API}/${talent.id}/files?category=${category}`, fd);
      toast.success(t('talents.saved'));
      onChanged();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const download = async (f: Talent['files'][number]) => {
    try {
      const url = URL.createObjectURL(await fetchFileBlob(f.id));
      const a = document.createElement('a');
      a.href = url; a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast.error(errText(e)); }
  };
  return (
    <div className="span-2">
      <Card title={t('talents.files')}>
        <div className="stack">
          {canWrite && (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ width: 240 }}>
                <label htmlFor="file-cat">{t('talents.category')}</label>
                <select id="file-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(`talents.categories.${c}`)}</option>)}
                </select>
              </div>
              <input ref={input} type="file" hidden data-testid="talent-file-input"
                accept={category === 'PHOTO' ? 'image/png,image/jpeg,image/webp' : '.pdf,.doc,.docx,image/png,image/jpeg'}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
              <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>{t('talents.upload')}</Button>
              <span className="muted" style={{ fontSize: 12 }}>{t('talents.fileHint')}</span>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('talents.category')}</th><th>{t('common.createdAt')}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {talent.files.map((f) => (
                  <tr key={f.id} data-testid="file-row">
                    <td>{f.name}</td><td>{t(`talents.categories.${f.category}`, f.category)}</td><td>{formatDate(f.createdAt, i18n.language)}</td>
                    <td className="row" style={{ gap: 4 }}>
                      <Button size="sm" variant="ghost" onClick={() => download(f)}>{t('talents.download')}</Button>
                      {canWrite && <Button size="sm" variant="ghost" onClick={async () => {
                        if (!window.confirm(t('talents.confirmDelete'))) return;
                        try { await http.del(`${TALENT_API}/files/${f.id}`); onChanged(); } catch (e) { toast.error(errText(e)); }
                      }}>{t('talents.delete')}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {talent.files.length === 0 && <div className="empty">{t('talents.empty')}</div>}
          </div>
        </div>
      </Card>
    </div>
  );
}
