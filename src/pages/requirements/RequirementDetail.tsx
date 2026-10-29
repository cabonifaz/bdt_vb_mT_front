// Ficha del requerimiento: encabezado (siempre visible), pipeline de candidatos en Kanban por etapa
// (Observado → Datos completos → En entrevista → Confirmado) y pestaña de detalle (vacantes, contactos, condiciones).
// Reglas del servidor: confirmar exige haber pasado de "Observado" y cupo en la vacante; un RQ cerrado queda de solo lectura
// hasta que el jefe de selección lo reabre (rq.reopen) por renuncia de un talento o más vacantes.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, UserPlus } from 'lucide-react';
import { ApiError, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { TALENT_API, useLabel, type TalentSummary } from '../../lib/talents';
import { RQ_API, daysToDue, dueLevel, fullTalentName, useRequirement, useRqCatalogs, type RQCandidate, type RQDetail } from '../../lib/requirements';
import { Kanban, MoveMenu } from '../../components/kanban/Kanban';
import { TalentPhoto } from '../../components/talents/bits';
import { Button, Modal, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { RequirementEditor } from './RequirementEditor';
import { ReopenModal } from './ReopenModal';
import { ResignationBadge } from './ResignationBadge';
import { CandidateModal } from './CandidateModal';
import { DocMeter } from './DocMeter';
import { docSummary } from '../../lib/documents';

export function RequirementDetail() {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const { can } = useAuth();
  const { tenant = '', id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const cat = useRqCatalogs();
  const q = useRequirement(id);
  const [tab, setTab] = useState<'pipeline' | 'detail'>('pipeline');
  const [vacancy, setVacancy] = useState('');
  const location = useLocation();
  const [editing, setEditing] = useState<false | 'data' | 'vacancies'>(
    (location.state as { edit?: 'vacancies' } | null)?.edit === 'vacancies' ? 'vacancies' : false);
  // el pedido de abrir el editor se consume una vez (no vuelve a abrirse al recargar)
  useEffect(() => { if (location.state) void nav(location.pathname, { replace: true, state: null }); }, [location.state, location.pathname, nav]);
  const [adding, setAdding] = useState(false);
  const [openCand, setOpenCand] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError || !q.data) return <div className="page"><div className="alert alert-error" role="alert">{errText(q.error)}</div></div>;
  const rq = q.data;
  const stages = cat.byTable('CANDIDATE_STAGE');
  const canMove = can('rq.candidates') && !rq.closed;
  const level = dueLevel(rq);
  const days = daysToDue(rq.dueDate);
  const covered = rq.vacancies.reduce((a, v) => a + v.covered, 0);
  const total = rq.vacancies.reduce((a, v) => a + v.quantity, 0);
  const vacLabel = (vid: string) => label(rq.vacancies.find((v) => v.id === vid)?.profile);
  const cands = rq.candidates.filter((c) => !vacancy || c.vacancyId === vacancy);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rq', id] }); void qc.invalidateQueries({ queryKey: ['rq-board'] }); };
  // mover de etapa: optimista; si el servidor lo rechaza (sin cupo, aún observado) se revierte con el motivo
  const move = async (c: RQCandidate, stageId: string, vacancyId?: string) => {
    const st = stages.find((s) => s.id === stageId);
    if (!st) return;
    const prev = qc.getQueryData<RQDetail>(['rq', id]);
    qc.setQueryData<RQDetail>(['rq', id], (cur) => cur && { ...cur, candidates: cur.candidates.map((x) => (x.id === c.id ? { ...x, stage: { id: st.id, code: st.code, label: st.label }, vacancyId: vacancyId ?? x.vacancyId } : x)) });
    try {
      await http.patch(`${RQ_API}/candidates/${c.id}`, { stageId, vacancyId: vacancyId ?? null });
      toast.success(t('rq.cand.moved', { name: fullTalentName(c.talent), stage: label(st.label) }));
    } catch (e) {
      qc.setQueryData(['rq', id], prev);
      toast.error(errText(e));
    } finally { refresh(); }
  };
  const remove = async (c: RQCandidate) => {
    if (!window.confirm(t('rq.cand.confirmRemove', { name: fullTalentName(c.talent) }))) return;
    try { await http.del(`${RQ_API}/candidates/${c.id}`); toast.success(t('rq.cand.removed')); } catch (e) { toast.error(errText(e)); } finally { refresh(); }
  };
  const del = async () => {
    if (!window.confirm(t('rq.confirmDelete', { code: rq.code }))) return;
    try { await http.del(`${RQ_API}/${rq.id}`); toast.success(t('rq.deleted')); void qc.invalidateQueries({ queryKey: ['rq-board'] }); nav(`/${tenant}/requerimientos`); }
    catch (e) { toast.error(errText(e)); }
  };
  const stageOptions = stages.map((s) => ({ id: s.id, label: label(s.label) }));

  return (
    <div className="page rq-detail">
      <header className="pf-head rq-head">
        <div className="pf-id">
          <Link to={`/${tenant}/requerimientos`} className="back-link"><ArrowLeft size={15} />{t('rq.backToBoard')}</Link>
          <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span className="rq-code">{rq.code}</span>
            <h1 style={{ margin: 0 }}>{rq.title}</h1>
            <span className={`badge rq-st-${rq.status.code.toLowerCase()}`} data-testid="rq-status">{label(rq.status.label)}</span>
          </div>
          <div className="pf-sub">
            <span className="pf-headline">{label(rq.client.label)}</span>
            <span className={`rq-due${level ? ` due-${level}` : ''}`}><CalendarClock size={13} />
              {new Date(`${rq.dueDate}T12:00:00`).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' })}
              {!rq.closed && ` · ${days < 0 ? t('rq.overdueBy', { count: -days }) : days === 0 ? t('rq.dueToday') : t('rq.dueIn', { count: days })}`}</span>
            <span data-testid="rq-coverage">{t('rq.coverage', { covered, total })}</span>
            {rq.owners.length > 0 && <span data-testid="rq-owners">{t('rq.ownersShort', { count: rq.owners.length })}: {rq.owners.map((o) => o.name).join(', ')}</span>}
          </div>
        </div>
        <div className="pf-actions">
          {rq.closed && can('rq.reopen') && <Button variant="secondary" size="sm" onClick={() => setReopening(true)} data-testid="rq-reopen"><RotateCcw size={15} />{t('rq.reopen.action')}</Button>}
          {can('rq.delete') && <Button variant="secondary" size="sm" onClick={del} aria-label={t('rq.delete')} title={t('rq.delete')}><Trash2 size={15} /></Button>}
          {can('rq.write') && <Button size="sm" onClick={() => setEditing('data')} data-testid="rq-edit"><Pencil size={15} />{t('rq.edit')}</Button>}
        </div>
      </header>
      {rq.closed && <div className="alert alert-info" role="status">{t(can('rq.reopen') ? 'rq.closedReadOnlyLead' : 'rq.closedReadOnly')}</div>}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'pipeline'} onClick={() => setTab('pipeline')} data-testid="rq-tab-pipeline">
          {t('rq.tab.pipeline')}<span className="count">{rq.candidates.length}</span></button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'detail'} onClick={() => setTab('detail')} data-testid="rq-tab-detail">{t('rq.tab.detail')}</button>
      </div>

      {tab === 'pipeline' && <>
        <div className="rq-filters">
          <div className="chips" role="group" aria-label={t('rq.vacancyFilter')}>
            <button type="button" className={`chip chip-toggle${vacancy === '' ? ' on' : ''}`} onClick={() => setVacancy('')}>{t('rq.allVacancies')}</button>
            {rq.vacancies.map((v) => (
              <button key={v.id} type="button" className={`chip chip-toggle${vacancy === v.id ? ' on' : ''}`} onClick={() => setVacancy(v.id)} data-testid="rq-vac-chip">
                {label(v.profile)} <span className="muted">{v.covered}/{v.quantity}</span></button>
            ))}
          </div>
          <span className="spacer" />
          {(rq.documents ?? []).some((x) => x.mode === 'REQUIRED') && (() => {
            const active = rq.candidates.filter((x) => !x.resignation);
            const done = active.filter((x) => { const s = docSummary(x.docs); return s.total > 0 && s.verified === s.total; }).length;
            return <span className="badge badge-neutral rq-docs-summary" data-testid="rq-docs-summary">{t('rq.docs.summary', { done, total: active.length })}</span>;
          })()}
          {canMove && <Button size="sm" onClick={() => setAdding(true)} data-testid="rq-add-candidate"><UserPlus size={15} />{t('rq.cand.add')}</Button>}
        </div>
        <Kanban<RQCandidate> ariaLabel={t('rq.tab.pipeline')} testId="rq-pipeline" items={cands} columnOf={(c) => c.stage.id} canDrag={(c) => canMove && !c.resignation}
          columns={stages.map((s) => ({ id: s.id, title: label(s.label), tone: s.code.toLowerCase() }))} empty={t('rq.cand.emptyColumn')}
          onMove={(c, to) => void move(c, to)}
          renderCard={(c) => (
            <article className={`cand-card${c.resignation ? ' resigned' : ''}`} data-testid="cand-card">
              <div className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <TalentPhoto fileId={c.talent.photoId ?? undefined} name={fullTalentName(c.talent)} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button type="button" className="cand-name link-button" onClick={() => setOpenCand(c.id)} data-testid="cand-open">{fullTalentName(c.talent)}</button>
                  {c.talent.headline && <div className="cand-sub">{c.talent.headline}</div>}
                </div>
                {canMove && !c.resignation && (
                  <MoveMenu label={t('rq.moveTo')} current={c.stage.id} testId="cand-move"
                    options={[...stageOptions, ...rq.vacancies.filter((v) => v.id !== c.vacancyId).map((v) => ({ id: `vac:${v.id}`, label: t('rq.cand.toVacancy', { profile: label(v.profile) }) })), { id: 'remove', label: t('rq.cand.remove') }]}
                    onPick={(opt) => (opt === 'remove' ? void remove(c) : opt.startsWith('vac:') ? void move(c, c.stage.id, opt.slice(4)) : void move(c, opt))} />
                )}
              </div>
              {(c.docs ?? []).length > 0 && <DocMeter docs={c.docs!} labels={rq.documents ?? []} onOpen={() => setOpenCand(c.id)} />}
              <div className="cand-foot">
                <span className="badge badge-neutral">{vacLabel(c.vacancyId)}</span>
                {c.resignation && <ResignationBadge r={c.resignation} />}
                {c.talent.blacklisted && <span className="badge badge-danger" title={t('blacklist.inBlacklist')}><TriangleAlert size={12} />{t('rq.cand.blacklisted')}</span>}
              </div>
            </article>
          )} />
      </>}

      {tab === 'detail' && <DetailTab rq={rq} />}

      {editing && <RequirementEditor rq={rq} initialTab={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      {reopening && <ReopenModal rq={rq} onClose={() => setReopening(false)} onDone={(reason) => { if (reason === 'MORE_VACANCIES') void q.refetch().then(() => setEditing('vacancies')); }} />}
      {openCand && <CandidateModal candidateId={openCand} onClose={() => setOpenCand(null)} />}
      {adding && <AddCandidate rq={rq} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); refresh(); }} />}
    </div>
  );
}

function DetailTab({ rq }: { rq: RQDetail }) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const cat = useRqCatalogs();
  const lab = (id?: string | null) => label(cat.data?.find((x) => x.id === id)?.label);
  const money = (n?: number | null) => (n === null || n === undefined ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const conditions = [rq.needsEmo && t('rq.needsEmo'), rq.needsSctr && t('rq.needsSctr'), rq.needsLaptop && t('rq.needsLaptop')].filter(Boolean).join(' · ');
  return (
    <div className="pf-body">
      <div className="pf-main">
        {rq.description && <section className="pf-section"><header><h3>{t('rq.description')}</h3></header><p className="pre pf-text">{rq.description}</p></section>}
        <section className="pf-section" data-testid="rq-vacancies">
          <header><h3>{t('rq.tab.vacancies')}</h3></header>
          {rq.vacancies.map((v) => (
            <div key={v.id} className="pf-item">
              <div className="grow">
                <div className="pf-item-title">{label(v.profile)} <span className="muted">· {t('rq.coverage', { covered: v.covered, total: v.quantity })}</span></div>
                {rq.canSeeRates && (v.rateInitial != null || v.rateFinal != null) && <div className="pf-item-meta">{t('rq.rate')}: {money(v.rateInitial)} – {money(v.rateFinal)}</div>}
                {v.skills.length > 0 && <div className="chips" style={{ marginTop: 4 }}>{v.skills.map((k) => (
                  <span key={k.skillId} className={`chip${k.optional ? ' chip-muted' : ''}`}>{label(k.label)}{k.years ? ` · ${k.years}a` : ''}{k.optional ? ` (${t('rq.optional').toLowerCase()})` : ''}</span>
                ))}</div>}
                {v.careers.length > 0 && <div className="pf-item-meta" style={{ marginTop: 4 }}>{v.careers.map((c) => [c.career, label(c.grade ?? undefined)].filter(Boolean).join(' · ') + (c.optional ? ` (${t('rq.optional').toLowerCase()})` : '')).join(' | ')}</div>}
              </div>
            </div>
          ))}
        </section>
        {rq.canSeeRates && (rq.billing ?? []).length > 0 && (
          <section className="pf-section"><header><h3>{t('rq.tab.billing')}</h3></header>
            {rq.billing!.map((b) => (
              <div key={b.contractId} className="pf-item"><div className="grow">
                <div className="pf-item-title">{label(b.contractLabel)} <span className="muted">· {b.currencyCode}</span></div>
                <div className="pf-item-meta">{(['base', 'mobility', 'monthly', 'quarterly', 'semiannual'] as const)
                  .filter((k) => b[`${k}Min`] != null || b[`${k}Max`] != null)
                  .map((k) => `${t(`rq.band.${k}`)}: ${money(b[`${k}Min`])} – ${money(b[`${k}Max`])}`).join(' · ')}</div>
              </div></div>
            ))}
          </section>
        )}
      </div>
      <aside className="pf-aside">
        <section className="pf-section"><header><h3>{t('rq.conditions')}</h3></header>
          <dl className="kv">
            <dt>{t('rq.requestDate')}</dt><dd>{rq.requestDate}</dd>
            <dt>{t('rq.workModality')}</dt><dd>{lab(rq.workModalityId) || '—'}</dd>
            <dt>{t('rq.contractDuration')}</dt><dd>{rq.contractValue ? `${rq.contractValue} ${lab(rq.contractUnitId)}` : '—'}</dd>
            <dt>{t('rq.serviceDuration')}</dt><dd>{rq.durationValue ? `${rq.durationValue} ${lab(rq.durationUnitId)}` : '—'}</dd>
            <dt>{t('rq.requirements')}</dt><dd>{conditions || '—'}</dd>
          </dl>
        </section>
        <section className="pf-section" data-testid="rq-contacts"><header><h3>{t('rq.tab.contacts')}</h3></header>
          {rq.contacts.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
          {rq.contacts.map((c) => (
            <div key={c.id} className="pf-item"><div className="grow">
              <div className="pf-item-title">{[c.firstName, c.lastName, c.secondLastName].filter(Boolean).join(' ')}</div>
              <div className="pf-item-meta">{[c.position, c.email, c.phone].filter(Boolean).join(' · ')}</div>
            </div></div>
          ))}
        </section>
        {(rq.reopens ?? []).length > 0 && (
          <section className="pf-section" data-testid="rq-reopens"><header><h3>{t('rq.reopen.history')}</h3></header>
            {rq.reopens!.map((r, i) => (
              <div key={i} className="pf-item"><div className="grow">
                <div className="pf-item-title">{t(`rq.reopen.reasons.${r.reason}`)}</div>
                {(r.resigned ?? []).length > 0 && <div className="pf-item-meta">{r.resigned!.map(fullTalentName).join(', ')}</div>}
                <div className="pf-item-meta">{formatDate(r.createdAt, i18n.language)} · {label(r.from)} → {label(r.to)}</div>
                {r.notes && <div className="pf-item-meta pre">{r.notes}</div>}
              </div></div>
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}

/** Agregar un talento al RQ: búsqueda en el servidor + vacante. Avisa si está en lista negra (global o del cliente). */
function AddCandidate({ rq, onClose, onAdded }: { rq: RQDetail; onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const toast = useToast();
  const errText = useErrorText();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<TalentSummary[]>([]);
  const [pick, setPick] = useState<TalentSummary | null>(null);
  const [vacancyId, setVacancyId] = useState(rq.vacancies.length === 1 ? rq.vacancies[0].id : '');
  const [busy, setBusy] = useState(false);
  const already = useMemo(() => new Set(rq.candidates.map((c) => c.talent.id)), [rq.candidates]);
  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) { setFound([]); return; }
    try { setFound((await http.post<{ items: TalentSummary[] }>(`${TALENT_API}/search`, { search: text.trim(), pageSize: 8 })).items); } catch { setFound([]); }
  };
  const add = async () => {
    if (!pick || !vacancyId) return;
    setBusy(true);
    try {
      await http.post(`${RQ_API}/${rq.id}/candidates`, { id: crypto.randomUUID(), talentId: pick.id, vacancyId });
      toast.success(t('rq.cand.added', { name: fullTalentName(pick) }));
      onAdded();
    } catch (e) { toast.error(e instanceof ApiError ? errText(e) : String(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={t('rq.cand.addTitle', { code: rq.code })} onClose={onClose}
      footer={<><span className="spacer" /><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={add} loading={busy} disabled={!pick || !vacancyId} data-testid="cand-add-confirm"><Plus size={15} />{t('rq.cand.add')}</Button></>}>
      <div className="stack">
        <div className="field"><label htmlFor="cand-q">{t('rq.cand.search')}</label>
          <input id="cand-q" className="input" type="search" autoFocus placeholder={t('rq.cand.searchPh')} value={q} onChange={(e) => void search(e.target.value)} /></div>
        {!pick && found.length > 0 && (
          <div className="item-list" role="listbox" aria-label={t('rq.cand.search')}>
            {found.map((x) => (
              <button key={x.id} type="button" role="option" aria-selected={false} className="item-row option-row" disabled={already.has(x.id)} onClick={() => setPick(x)} data-testid="cand-option">
                <TalentPhoto fileId={x.photoId} name={fullTalentName(x)} size={28} />
                <span className="grow" style={{ textAlign: 'left' }}><strong>{fullTalentName(x)}</strong><span className="muted" style={{ display: 'block' }}>{x.headline || '—'}</span></span>
                {already.has(x.id) ? <span className="muted">{t('rq.cand.already')}</span> : x.isBlacklisted && <span className="badge badge-danger">{t('rq.cand.blacklisted')}</span>}
              </button>
            ))}
          </div>
        )}
        {pick && (
          <div className="item-row" style={{ alignItems: 'center' }}>
            <TalentPhoto fileId={pick.photoId} name={fullTalentName(pick)} size={32} />
            <span className="grow"><strong>{fullTalentName(pick)}</strong><span className="muted" style={{ display: 'block' }}>{pick.headline || '—'}</span></span>
            <Button size="sm" variant="ghost" onClick={() => setPick(null)}>{t('rq.cand.change')}</Button>
          </div>
        )}
        {pick?.isBlacklisted && <div className="alert alert-warning" role="alert"><TriangleAlert size={14} /> {t('rq.cand.blacklistWarn')}</div>}
        <div className="field"><label htmlFor="cand-vac">{t('rq.cand.vacancy')}</label>
          <select id="cand-vac" className="select" value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
            <option value="">—</option>{rq.vacancies.map((v) => <option key={v.id} value={v.id}>{label(v.profile)} ({v.covered}/{v.quantity})</option>)}</select></div>
      </div>
    </Modal>
  );
}

