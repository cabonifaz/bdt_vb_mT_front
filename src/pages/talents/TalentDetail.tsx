import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import {
  cachedGet, fetchFileBlob, fullName, TALENT_API, useLabel, useMasters, yearsLabel, type Collection, type Talent,
} from '../../lib/talents';
import { Button, Field, Modal, StatusBadge, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Chip, Stars, TalentPhoto } from '../../components/talents/bits';
import { TalentEditor } from './TalentEditor';
import { BlacklistPanel } from '../../components/blacklist/BlacklistPanel';
import { InterviewEditor, type InterviewPreset } from '../interviews/InterviewEditor';
import { STATUS_TONE, type BlacklistEntry, type InterviewSummary } from '../../lib/modules';
import { Link, useNavigate } from 'react-router';
import { ContactBar, RatesLine } from '../../components/talents/ContactBar';
import { Icon } from '../../components/ui/Icon';
import { Check, Heart, Plus, Search, X } from 'lucide-react';
import { Loader } from '../../components/ui/Loader';
import { AvailabilityChip, EquipmentChip } from '../../components/talents/QuickChips';
import { ProfileMeter } from '../../components/talents/ProfileMeter';
import { talentFacts } from '../../lib/completeness';
import { CvModal } from '../../components/talents/CvModal';

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
  const [blOpen, setBlOpen] = useState(false);
  const [ivPreset, setIvPreset] = useState<InterviewPreset | null>(null);
  const [phoneChoice, setPhoneChoice] = useState<InterviewSummary[] | null>(null);
  const [cvOpen, setCvOpen] = useState(false);
  const bl = useQuery({ queryKey: ['blacklist', id], queryFn: () => http.get<BlacklistEntry[]>(`/api/v1/tenant/talents/${id}/blacklist`) });
  const ivs = useQuery({ queryKey: ['interviews', { talentId: id }], enabled: can('interview.read'),
    queryFn: () => http.post<{ total: number; items: InterviewSummary[] }>('/api/v1/tenant/interviews/search', { talentId: id, pageSize: 50 }) });
  const { tenant = '' } = useParams();
  const navTo = useNavigate(); // navegación interna: conserva filtros en memoria

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

  if (q.isLoading) return <Loader />;
  if (q.isError || !q.data) return <div className="page"><div className="alert alert-error" role="alert">{errText(q.error)}</div></div>;
  const x = q.data;
  const name = fullName(x);
  const open = (m: typeof modal, item: Record<string, unknown> | null = null) => { setEditing(item); setModal(m); };
  const del = (section: string, itemId: string) => run(() => http.del(`${TALENT_API}/sections/${section}/${itemId}`));
  /** Edición rápida desde la ficha: se refleja al instante y se revierte si falla. */
  const quick = async (patch: Partial<Talent>, path: string, body: unknown) => {
    qc.setQueryData<Talent>(['talent', id], (cur) => (cur ? { ...cur, ...patch } : cur));
    if (!(await run(() => http.patch(`${TALENT_API}/${id}/${path}`, body, true)))) refresh();
  };

  const curr = (cid?: string) => masters.byTable('CURRENCY').find((c) => c.id === cid)?.code;
  const blocked = (bl.data?.length ?? 0) > 0;
  const blClients = bl.data ?? [];
  const startPhone = () => {
    const phones = (ivs.data?.items ?? []).filter((i) => i.typeCode === 'PHONE');
    if (phones.length) setPhoneChoice(phones);
    else setIvPreset({ talentId: x.id, talentName: name, typeCode: 'PHONE', stageCode: 'PHONE_SCREEN' });
  };
  const isFav = x.collections.length > 0;
  return (
    <div className="pf">
      <header className="pf-head">
        <TalentPhoto fileId={x.photoId} name={name} size={64} />
        <div className="pf-id">
          <div className="row" style={{ gap: 8 }}>
            <h1 data-testid="talent-name">{name}</h1>
            {x.status === 'ARCHIVED' && <StatusBadge status="DISABLED" />}
            <ProfileMeter facts={talentFacts(x)} inline onClick={canWrite ? () => open('editor') : undefined} />
          </div>
          <div className="pf-sub">
            {x.headline && <span className="pf-headline">{x.headline}</span>}
            {(x.city || x.country) && <span title={t('talents.residence')} data-testid="residence"><Icon name="mapPin" size={13} /> {[x.city, label(x.country)].filter(Boolean).join(', ')}</span>}
            {(x.originCity || x.originCountry) && <span title={t('talents.origin')} data-testid="origin"><span className="muted">{t('talents.originShort')}:</span> {[x.originCity, label(x.originCountry)].filter(Boolean).join(', ')}</span>}
            <span className="row" style={{ gap: 4 }}><Stars value={x.avgRating} size={12} />{x.avgRating ? x.avgRating.toFixed(1) : ''}</span>
          </div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <ContactBar items={[
              { key: 'email', icon: 'mail', label: t('talents.email'), value: x.email, href: x.email ? `mailto:${x.email}` : undefined, actionLabel: t('talents.write') },
              { key: 'phone', icon: 'phone', label: t('talents.phone'), value: x.phone, href: x.phone ? `tel:${x.phone.replace(/\s/g, '')}` : undefined, actionLabel: t('talents.call') },
              { key: 'doc', icon: 'idcard', label: t('talents.docNumber'), value: x.docNumber ? `${label(masters.byTable('DOC_IDENTITY_TYPE').find((d) => d.id === x.docTypeId)?.label)} ${x.docNumber}`.trim() : undefined },
              { key: 'linkedin', icon: 'linkedin', label: t('talents.linkedin'), value: x.linkedinUrl, href: x.linkedinUrl, actionLabel: t('talents.open') },
              { key: 'github', icon: 'github', label: t('talents.github'), value: x.githubUrl, href: x.githubUrl, actionLabel: t('talents.open') },
            ]} />
            <AvailabilityChip value={x.availabilityId} editable={canWrite}
              onChange={(v) => quick({ availabilityId: v ?? undefined }, 'availability', { availabilityId: v })} />
            <EquipmentChip value={x.hasEquipment} editable={canWrite} onChange={(v) => quick({ hasEquipment: v }, 'equipment', { hasEquipment: v })} />
          </div>
          {x.canSeeRates && (
            <RatesLine rates={x.rates} modality={label(masters.byTable('BILLING_MODALITY').find((m) => m.id === x.rates?.modalityId)?.label) || undefined}
              payrollCurrency={curr(x.rates?.payrollCurrencyId)} rxhCurrency={curr(x.rates?.rxhCurrencyId)} />
          )}
          {blocked && (
            <div className="row" style={{ gap: 4, marginTop: 6 }} data-testid="bl-chips">
              {blClients.slice(0, 3).map((e) => <span key={e.id} className="badge badge-danger" title={e.reason}><Icon name="ban" size={11} /> {e.client ? label(e.client) : t('blacklist.allClients')}</span>)}
              {blClients.length > 3 && <button className="badge badge-danger link-btn" onClick={() => setBlOpen(true)}>+{blClients.length - 3}</button>}
            </div>
          )}
        </div>
        <div className="pf-actions">
          <IconButton icon="heart" label={t('talents.addToCollection')} active={isFav} onClick={() => open('collection')} testId="fav-talent" />
          <IconButton icon="ban" label={blocked ? t('blacklist.inBlacklist') : t('blacklist.add')} danger={blocked} onClick={() => setBlOpen(true)} testId="bl-talent" />
          {can('interview.write') && <IconButton icon="phoneCall" label={t('interviews.phoneInterview')} onClick={startPhone} testId="phone-interview" />}
          {can('talent.cv.generate') && <IconButton icon="cv" label={t('cv.generate')} onClick={() => setCvOpen(true)} testId="cv-generate" />}
          {x.cvId && <IconButton icon="file" label={t('talents.viewCv')} onClick={async () => window.open(URL.createObjectURL(await fetchFileBlob(x.cvId!, true)), '_blank', 'noopener')} />}
          {canWrite && <IconButton icon="archive" label={x.status === 'ACTIVE' ? t('talents.archive') : t('talents.activate')}
            onClick={() => run(() => http.patch(`${TALENT_API}/${id}/status`, { status: x.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' }))} />}
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => open('editor')} data-testid="edit-talent"><Icon name="edit" size={15} />{t('talents.edit')}</button>}
        </div>
      </header>

      <div className="pf-body">
        <div className="pf-main">
          {x.summary && <Section title={t('talents.summary')}><p className="pre pf-text">{x.summary}</p></Section>}

          <Section title={t('talents.experience')} onAdd={canWrite ? () => open('experience') : undefined} addLabel={t('talents.addExperience')}>
            {x.experiences.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
            {x.experiences.map((e) => (
              <div key={e.id} className="pf-item" data-testid="experience-row">
                <div className="grow">
                  <div className="pf-item-title">{e.position} <span className="muted">· {e.company}</span></div>
                  <div className="pf-item-meta">{e.startDate.slice(0, 7)} — {e.isCurrent ? t('talents.present') : e.endDate?.slice(0, 7)} · {yearsLabel(e.months, t)}</div>
                  {e.functions && <p className="pre pf-text" style={{ marginTop: 4 }}>{e.functions}</p>}
                </div>
                {canWrite && <RowActions onEdit={() => open('experience', e)} onDelete={() => del('experiences', e.id)} />}
              </div>
            ))}
          </Section>

          <Section title={t('talents.educationTitle')} onAdd={canWrite ? () => open('education') : undefined} addLabel={t('talents.addEducation')}>
            {x.educations.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
            {x.educations.map((d) => (
              <div key={d.id} className="pf-item">
                <div className="grow">
                  <div className="pf-item-title">{d.career}{d.grade && <span className="muted"> · {label(d.grade)}</span>}</div>
                  <div className="pf-item-meta">{d.institution} · {fmtEdu(d.startDate, d.datePrecision)} — {d.isCurrent ? t('talents.present') : fmtEdu(d.endDate, d.datePrecision)}</div>
                </div>
                {canWrite && <RowActions onEdit={() => open('education', d)} onDelete={() => del('educations', d.id)} />}
              </div>
            ))}
          </Section>

          {can('interview.read') && <Section title={t('nav.interviews')} onAdd={can('interview.write') ? () => setIvPreset({ talentId: x.id, talentName: name }) : undefined} addLabel={t('interviews.new')}>
            {(ivs.data?.items.length ?? 0) === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
            {ivs.data?.items.map((iv) => (
              <div key={iv.id} className="pf-item compact" data-testid="talent-interview">
                <Icon name={iv.typeCode === 'PHONE' ? 'phone' : iv.typeCode === 'IN_PERSON' ? 'mapPin' : 'video'} size={15} />
                <div className="grow"><Link className="fav-link pf-item-title" to={`/${tenant}/entrevistas/${iv.id}`}>{label(iv.stage)}</Link>
                  <div className="pf-item-meta">{iv.date} · {iv.time}{iv.client ? ` · ${label(iv.client)}` : ''}</div></div>
                <span className={`badge badge-${STATUS_TONE[iv.statusCode]}`}>{label(iv.status)}</span>
              </div>
            ))}
          </Section>}

          <Section title={t('talents.feedback')} onAdd={() => open('feedback')} addLabel={t('talents.addFeedback')}>
            {x.feedback.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
            {x.feedback.map((f) => (
              <div key={f.id} className="pf-item">
                <div className="grow">
                  <div className="pf-item-meta row" style={{ gap: 8 }}><Stars value={f.stars} size={11} /><span>{f.authorName}</span><span>{formatDate(f.createdAt, i18n.language)}</span></div>
                  <p className="pre pf-text" style={{ marginTop: 2 }}>{f.comment}</p>
                </div>
                {(f.isMine || f.canDelete) && <RowActions onEdit={f.isMine ? () => open('feedback', f) : undefined}
                  onDelete={f.canDelete ? () => run(() => http.del(`${TALENT_API}/feedback/${f.id}`)) : undefined} />}
              </div>
            ))}
          </Section>
        </div>

        <aside className="pf-aside">
          <SkillsSection title={t('talents.skills')} table="TECH_SKILL" withYears canWrite={canWrite}
            items={x.techSkills.map((sk) => ({ id: sk.id, name: label(sk.label), years: sk.years }))}
            onAdd={(skill, years) => run(() => http.put(`${TALENT_API}/${id}/tech-skills`, { id: crypto.randomUUID(), ...skill, years }, true))}
            onRemove={(sid) => del('tech-skills', sid)} />
          <SkillsSection title={t('talents.softSkills')} table="SOFT_SKILL" canWrite={canWrite}
            items={x.softSkills.map((sk) => ({ id: sk.id, name: label(sk.label) }))}
            onAdd={(skill) => run(() => http.post(`${TALENT_API}/${id}/soft-skills`, { id: crypto.randomUUID(), ...skill }, true))}
            onRemove={(sid) => del('soft-skills', sid)} />

          <Section title={t('talents.languages')} onAdd={canWrite ? () => open('language') : undefined} addLabel={t('talents.addLanguage')}>
            {x.languages.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
            {x.languages.map((l) => (
              <div key={l.id} className="pf-item compact">
                <div className="grow"><span className="pf-item-title">{label(l.language)}</span> <span className="pf-item-meta">· {label(l.level)}</span></div>
                <Stars value={l.stars} size={11} />
                {canWrite && <RowActions onEdit={() => open('language', l)} onDelete={() => del('languages', l.id)} />}
              </div>
            ))}
          </Section>

          <FilesSection talent={x} canWrite={canWrite} onChanged={refresh} />
        </aside>
      </div>

      {cvOpen && <CvModal talent={x} canSave={canWrite} onClose={() => setCvOpen(false)} onSaved={refresh} />}
      {blOpen && <Modal open wide title={`${t('nav.blacklist')} · ${name}`} onClose={() => setBlOpen(false)} footer={<Button onClick={() => setBlOpen(false)}>{t('common.close')}</Button>}>
        <BlacklistPanel talentId={x.id} talentName={name} />
      </Modal>}
      {ivPreset && <InterviewEditor preset={ivPreset} onClose={() => setIvPreset(null)} onSaved={(ivId) => {
        setIvPreset(null); toast.success(t('interviews.saved'));
        qc.invalidateQueries({ queryKey: ['interviews'] });
        navTo(`/${tenant}/entrevistas/${ivId}`);
      }} />}
      {phoneChoice && <Modal open title={t('interviews.phoneInterview')} onClose={() => setPhoneChoice(null)} footer={<>
        <Button variant="secondary" onClick={() => { const last = phoneChoice[0]; setPhoneChoice(null); navTo(`/${tenant}/entrevistas/${last.id}`); }} data-testid="phone-go-last">
          {t('interviews.goLastPhone', { date: `${phoneChoice[0].date} ${phoneChoice[0].time}` })}</Button>
        <Button onClick={() => { setPhoneChoice(null); setIvPreset({ talentId: x.id, talentName: name, typeCode: 'PHONE', stageCode: 'PHONE_SCREEN' }); }} data-testid="phone-new">{t('interviews.newPhone')}</Button>
      </>}><p>{t('interviews.hasPhone', { name, count: phoneChoice.length })}</p></Modal>}
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

function fmtEdu(d?: string, precision?: string) {
  if (!d) return '—';
  return precision === 'YEAR' ? d.slice(0, 4) : d.slice(0, 7);
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pf-row-actions">
      {onEdit && <button type="button" className="icon-ghost" onClick={onEdit} aria-label={t('talents.edit')} title={t('talents.edit')}><Icon name="edit" size={15} /></button>}
      {onDelete && <button type="button" className="icon-ghost danger" onClick={() => { if (window.confirm(t('talents.confirmDelete'))) onDelete(); }}
        aria-label={t('talents.delete')} title={t('talents.delete')}><Icon name="trash" size={15} /></button>}
    </div>
  );
}

function IconButton({ icon, label, onClick, active, danger, testId }: { icon: string; label: string; onClick: () => void; active?: boolean; danger?: boolean; testId?: string }) {
  return (
    <button type="button" className={`icon-ghost bordered${active ? ' on' : ''}${danger ? ' blocked' : ''}`} onClick={onClick} aria-label={label} title={label} data-testid={testId}>
      <Icon name={icon} size={17} filled={active && icon === 'heart'} />
    </button>
  );
}

/** Sección minimalista: título pequeño, separador fino y botón + (abre modal). */
function Section({ title, onAdd, addLabel, children }: { title: string; onAdd?: () => void; addLabel?: string; children: ReactNode }) {
  return (
    <section className="pf-section">
      <header>
        <h3>{title}</h3>
        {onAdd && <button type="button" className="icon-ghost" onClick={onAdd} aria-label={addLabel ?? title} title={addLabel ?? title}><Icon name="plus" size={16} /></button>}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Habilidades
function SkillsSection({ title, table, items, withYears, canWrite, onAdd, onRemove }: {
  title: string; table: string; withYears?: boolean; canWrite: boolean;
  items: { id: string; name: string; years?: number }[];
  onAdd: (skill: { skillId?: string; label?: string }, years?: number) => Promise<boolean>; onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Section title={title} onAdd={canWrite ? () => setOpen(true) : undefined} addLabel={`${t('talents.addSkill')} · ${title}`}>
      <div className="chips">
        {items.length === 0 && <span className="pf-empty">{t('talents.empty')}</span>}
        {items.map((sk) => (
          <Chip key={sk.id} onRemove={canWrite ? () => onRemove(sk.id) : undefined} removeLabel={`${t('talents.delete')} ${sk.name}`}>
            {sk.name}{withYears && <small>{sk.years}a</small>}
          </Chip>
        ))}
      </div>
      {open && <SkillModal title={title} table={table} withYears={withYears} onClose={() => setOpen(false)} onAdd={onAdd} />}
    </Section>
  );
}

/** Agregar habilidad en modal: del catálogo o escrita a mano (se crea en el catálogo del tenant). */
function SkillModal({ title, table, withYears, onClose, onAdd }: {
  title: string; table: string; withYears?: boolean; onClose: () => void;
  onAdd: (skill: { skillId?: string; label?: string }, years?: number) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const label = useLabel();
  const masters = useMasters();
  const [text, setText] = useState('');
  const [years, setYears] = useState('1');
  const options = masters.byTable(table);
  const listId = `dl-modal-${table}`;
  return (
    <SectionModal title={title} onClose={onClose} valid={!!text.trim()} onSubmit={() => {
      const match = options.find((o) => label(o.label).toLowerCase() === text.trim().toLowerCase());
      return onAdd(match ? { skillId: match.id } : { label: text.trim() }, withYears ? Number(years) : undefined);
    }}>
      <div className="field">
        <label htmlFor={`in-${table}`}>{title}</label>
        <input id={`in-${table}`} className="input" list={listId} placeholder={t('talents.skillPlaceholder')} value={text} maxLength={100} onChange={(e) => setText(e.target.value)} />
        <datalist id={listId}>{options.map((o) => <option key={o.id} value={label(o.label)} />)}</datalist>
      </div>
      {withYears && <Field label={t('talents.yearsShort')} type="number" min={0} max={60} step={0.5} value={years} onChange={(e) => setYears(e.target.value)} />}
    </SectionModal>
  );
}

// ---------------------------------------------------------------- Modales de secciones
function SectionModal({ title, onClose, onSubmit, children, valid = true, busyLabel }: {
  title: string; onClose: () => void; onSubmit: () => Promise<boolean>; children: ReactNode; valid?: boolean; busyLabel?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Modal open title={title} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={busy} disabled={!valid} onClick={async () => { setBusy(true); const ok = await onSubmit(); setBusy(false); if (ok) onClose(); }}>{t('common.save')}</Button>
    </>}>{children}{busy && <Loader variant="overlay" label={busyLabel ?? t('common.savingDots')} />}</Modal>
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
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  // la lista en caché puede no tener colecciones recién creadas en otra pantalla
  useEffect(() => { qc.invalidateQueries({ queryKey: ['collections'] }); }, [qc]);
  // estado optimista: el cambio se ve al instante y se revierte si el servidor rechaza
  const [inSet, setInSet] = useState<string[]>(talent.collections);
  const toggle = async (c: Collection, on: boolean) => {
    setInSet((cur) => (on ? [...cur, c.id] : cur.filter((x) => x !== c.id)));
    try {
      await (on ? http.put(`/api/v1/tenant/collections/${c.id}/talents/${talent.id}`) : http.del(`/api/v1/tenant/collections/${c.id}/talents/${talent.id}`));
      onChanged();
    } catch (e) {
      setInSet((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]));
      toast.error(errText(e));
    }
  };
  const name = q.trim();
  const create = async () => {
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await http.post('/api/v1/tenant/collections', { id, name });
      await http.put(`/api/v1/tenant/collections/${id}/talents/${talent.id}`);
      setInSet((cur) => [...cur, id]);
      setQ('');
      onChanged();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  // con muchas colecciones: las seleccionadas como chips arriba, y una sola lista filtrable (solo las editables)
  const selected = collections.filter((c) => inSet.includes(c.id));
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const editable = collections.filter((c) => c.access !== 'VIEW');
  const matches = editable.filter((c) => norm(c.name).includes(norm(name)));
  const exact = editable.some((c) => norm(c.name) === norm(name));
  const LIMIT = 8;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !name) return;
    e.preventDefault();
    if (matches.length) toggle(matches[0], !inSet.includes(matches[0].id)); else if (!busy) create();
  };
  return (
    <Modal open title={t('talents.addToCollection')} onClose={onClose} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {selected.length > 0 && (
        <div className="fav-picked" data-testid="fav-picked" aria-label={t('favorites.inCollections')}>
          {selected.map((c) => (
            <span key={c.id} className="fav-chip">
              <Heart size={12} fill="currentColor" aria-hidden />{c.name}
              {c.access !== 'VIEW' && (
                <button type="button" aria-label={t('favorites.removeFrom', { name: c.name })} onClick={() => toggle(c, false)}><X size={13} /></button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="fav-search">
        <Search size={16} aria-hidden />
        <input className="input" role="combobox" aria-expanded aria-controls="fav-options" aria-label={t('favorites.searchOrCreate')}
          placeholder={t('favorites.searchOrCreate')} maxLength={100} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
      </div>
      <ul id="fav-options" className="fav-options" role="listbox" aria-multiselectable>
        {matches.slice(0, LIMIT).map((c) => {
          const on = inSet.includes(c.id);
          return (
            <li key={c.id} role="option" aria-selected={on} className={on ? 'on' : ''} onClick={() => toggle(c, !on)}>
              <span className="grow">{c.name}{c.access !== 'OWNER' && <span className="muted"> · {c.ownerName}</span>}</span>
              <span className="muted">{c.talentCount}</span>
              <span className="fav-check">{on && <Check size={16} />}</span>
            </li>
          );
        })}
        {matches.length > LIMIT && <li className="muted fav-more" aria-disabled>{t('favorites.moreResults', { count: matches.length - LIMIT })}</li>}
        {name && !exact && (
          <li role="option" aria-selected={false} className="fav-create" data-testid="fav-create" onClick={() => !busy && create()}>
            <Plus size={16} /><span className="grow">{t('favorites.createNamed', { name })}</span>
          </li>
        )}
        {!name && editable.length === 0 && <li className="muted fav-more">{t('favorites.typeToCreate')}</li>}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------- Archivos
function FilesSection({ talent, canWrite, onChanged }: { talent: Talent; canWrite: boolean; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const download = async (f: Talent['files'][number]) => {
    try {
      const url = URL.createObjectURL(await fetchFileBlob(f.id));
      const a = document.createElement('a');
      a.href = url; a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast.error(errText(e)); }
  };
  return (
    <Section title={t('talents.files')} onAdd={canWrite ? () => setOpen(true) : undefined} addLabel={t('talents.upload')}>
      {talent.files.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
      {talent.files.map((f) => (
        <div key={f.id} className="pf-item compact" data-testid="file-row">
          <Icon name="file" size={15} />
          <div className="grow" style={{ minWidth: 0 }}>
            <button type="button" className="link-btn" onClick={() => download(f)} title={t('talents.download')}>{f.name}</button>
            <div className="pf-item-meta">{t(`talents.categories.${f.category}`, f.category)} · {formatDate(f.createdAt, i18n.language)}</div>
          </div>
          {canWrite && <RowActions onDelete={async () => {
            try { await http.del(`${TALENT_API}/files/${f.id}`); onChanged(); } catch (e) { toast.error(errText(e)); }
          }} />}
        </div>
      ))}
      {open && <UploadModal talentId={talent.id} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </Section>
  );
}

function UploadModal({ talentId, onClose, onDone }: { talentId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [category, setCategory] = useState('CV');
  const [file, setFile] = useState<File | null>(null);
  return (
    <SectionModal title={t('talents.upload')} onClose={onClose} valid={!!file} busyLabel={t('common.uploading')} onSubmit={async () => {
      const fd = new FormData();
      fd.append('file', file!);
      try {
        await http.post(`${TALENT_API}/${talentId}/files?category=${category}`, fd);
        toast.success(t('talents.saved'));
        onDone();
        return true;
      } catch (e) { toast.error(errText(e)); return false; }
    }}>
      <div className="field">
        <label htmlFor="file-cat">{t('talents.category')}</label>
        <select id="file-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`talents.categories.${c}`)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="file-in">{t('talents.files')}</label>
        <input id="file-in" type="file" data-testid="talent-file-input"
          accept={category === 'PHOTO' ? 'image/png,image/jpeg,image/webp' : '.pdf,.doc,.docx,image/png,image/jpeg'}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <span className="hint">{t('talents.fileHint')}</span>
      </div>
    </SectionModal>
  );
}
