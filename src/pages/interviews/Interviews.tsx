import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API_URL, getAccessToken, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { fullName, useLabel } from '../../lib/talents';
import { STATUS_TONE, useInterviewCatalogs, type Interview, type InterviewSummary } from '../../lib/modules';
import { formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { Pagination, Stars } from '../../components/talents/bits';
import { InterviewEditor } from './InterviewEditor';
import { InterviewFiles } from './InterviewFiles';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { WsBack } from '../../components/layout/WsBack';
import { Loader } from '../../components/ui/Loader';

const PAGE = 25;

/** Módulo de entrevistas: lista con filtros (en memoria) y detalle a la derecha. */
export function Interviews() {
  const { tenant = '', id } = useParams();
  const { t } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const cat = useInterviewCatalogs();
  const [text, setText] = useState('');
  const [f, setF] = useState({ search: '', statusId: '', stageId: '', typeId: '', clientId: '', date: '', page: 1 });
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const h = window.setTimeout(() => setF((c) => ({ ...c, search: text, page: 1 })), 350); return () => window.clearTimeout(h); }, [text]);
  const body = { ...f, pageSize: PAGE };
  const list = useQuery({ queryKey: ['interviews', body], queryFn: () => http.post<{ total: number; items: InterviewSummary[] }>('/api/v1/tenant/interviews/search', body), placeholderData: (p) => p });
  const active = [f.statusId, f.stageId, f.typeId, f.clientId, f.date].filter(Boolean).length;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF({ ...f, [k]: e.target.value, page: 1 });
  const opts = (table: string) => cat.byTable(table).map((x) => <option key={x.id} value={x.id}>{label(x.label)}</option>);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="ws">
      <aside className="ws-side" aria-label={t('nav.interviews')}>
        <div className="ws-side-head">
          <h1>{t('nav.interviews')}</h1>
          {list.data && <span className="muted" data-testid="iv-count">{list.data.total}</span>}
          <span className="spacer" />
          {can('interview.write') && <button className="btn btn-primary btn-sm icon-btn" onClick={() => setCreating(true)} aria-label={t('interviews.new')} title={t('interviews.new')} data-testid="new-interview"><Icon name="plus" size={18} /></button>}
        </div>
        <div className="ws-side-search">
          <input className="input" type="search" placeholder={t('interviews.searchPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('common.search')} />
          <button className={`btn btn-sm ${showFilters || active ? 'btn-secondary' : 'btn-ghost'} icon-btn filter-btn`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-label={t('talents.filters')}>
            <Icon name="filter" size={16} />{active > 0 && <span className="filter-count">{active}</span>}
          </button>
        </div>
        {showFilters && <div className="ws-filters stack">
          <div className="field"><label htmlFor="iv-f-status">{t('interviews.status')}</label><select id="iv-f-status" className="select" value={f.statusId} onChange={set('statusId')}><option value="">{t('talents.any')}</option>{opts('INTERVIEW_STATUS')}</select></div>
          <div className="field"><label htmlFor="iv-f-stage">{t('interviews.stage')}</label><select id="iv-f-stage" className="select" value={f.stageId} onChange={set('stageId')}><option value="">{t('talents.any')}</option>{opts('INTERVIEW_STAGE')}</select></div>
          <div className="field"><label htmlFor="iv-f-type">{t('interviews.type')}</label><select id="iv-f-type" className="select" value={f.typeId} onChange={set('typeId')}><option value="">{t('talents.any')}</option>{opts('INTERVIEW_TYPE')}</select></div>
          <SearchSelect id="iv-f-client" label={t('interviews.client')} value={f.clientId} onChange={(v) => setF({ ...f, clientId: v, page: 1 })} emptyLabel={t('talents.any')}
            options={cat.byTable('CLIENT').map((x) => ({ value: x.id, label: label(x.label) }))} />
          <div className="field"><label htmlFor="iv-f-date">{t('interviews.date')}</label><input id="iv-f-date" className="input" type="date" value={f.date} onChange={set('date')} /></div>
          {active > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setF({ search: f.search, statusId: '', stageId: '', typeId: '', clientId: '', date: '', page: 1 })}>{t('talents.clearFilters')}</button>}
        </div>}
        <nav className="ws-list">
          {list.isError && <div className="alert alert-error">{errText(list.error)}</div>}
          {list.data?.items.map((x) => (
            <Link key={x.id} to={`/${tenant}/entrevistas/${x.id}`} className={`talent-row${x.id === id ? ' active' : ''}`} data-testid="iv-row">
              <span className="iv-ico"><Icon name={x.typeCode === 'PHONE' ? 'phone' : x.typeCode === 'IN_PERSON' ? 'mapPin' : 'video'} size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{fullName(x)}</div>
                <div className="sub">{x.date === today ? <strong>{t('interviews.today')}</strong> : x.date} · {x.time} · {label(x.stage)}</div>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge badge-${STATUS_TONE[x.statusCode]}`}>{label(x.status)}</span>
                  <span className="sub">{x.client ? label(x.client) : t('interviews.noClient')}</span>
                </div>
              </div>
            </Link>
          ))}
          {list.data?.items.length === 0 && <p className="pf-empty" style={{ padding: 8 }}>{t('interviews.empty')}</p>}
          {list.data && list.data.total > PAGE && <Pagination page={f.page} total={list.data.total} pageSize={PAGE} onPage={(p) => setF({ ...f, page: p })} labels={{ prev: '‹', next: '›', of: t('talents.of') }} />}
        </nav>
      </aside>
      <section className="ws-detail">
        {id && <WsBack to={`/${tenant}/entrevistas`} label={t('nav.interviews')} />}
        {id ? <InterviewDetail id={id} tenant={tenant} /> :
          <div className="ws-empty"><div className="stack" style={{ alignItems: 'center' }}><Icon name="interviews" size={40} /><p>{t('interviews.selectOne')}</p></div></div>}
      </section>
      {creating && <InterviewEditor onClose={() => setCreating(false)} onSaved={(newId) => {
        setCreating(false); toast.success(t('interviews.saved'));
        qc.invalidateQueries({ queryKey: ['interviews'] }); nav(`/${tenant}/entrevistas/${newId}`);
      }} />}
    </div>
  );
}

export function InterviewDetail({ id, tenant }: { id: string; tenant: string }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['interview', id], queryFn: () => http.get<Interview>(`/api/v1/tenant/interviews/${id}`) });
  if (q.isLoading) return <Loader />;
  if (q.isError || !q.data) return <div className="pf"><div className="alert alert-error">{errText(q.error)}</div></div>;
  const x = q.data;
  const isPhone = x.typeCode === 'PHONE';
  const downloadIcs = async () => {
    const res = await fetch(`${API_URL}/api/v1/tenant/interviews/${id}/ics`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, credentials: 'include' });
    if (!res.ok) { toast.error(t('errors.default')); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `entrevista-${id}.ics`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const areas = [['personal', x.ratingPersonal, x.notesPersonal], ['experience', x.ratingExperience, x.notesExperience],
    ['languages', x.ratingLanguages, x.notesLanguages], ['education', x.ratingEducation, x.notesEducation]] as const;
  return (
    <div className="pf">
      <header className="pf-head">
        <span className="iv-ico lg"><Icon name={isPhone ? 'phone' : x.typeCode === 'IN_PERSON' ? 'mapPin' : 'video'} size={24} /></span>
        <div className="pf-id">
          <h1 data-testid="iv-title"><Link className="fav-link" to={`/${tenant}/talentos/${x.talentId}`}>{fullName(x)}</Link></h1>
          <div className="pf-sub">
            <span className="pf-headline">{x.profile}</span>
            <span>{label(x.type)} · {label(x.stage)}</span>
            <span className={`badge badge-${STATUS_TONE[x.statusCode]}`} data-testid="iv-status">{label(x.status)}</span>
          </div>
          <div className="pf-sub" style={{ marginTop: 6 }}>
            <span className="meta-chip"><Icon name="calendar" size={13} />{x.date} · {x.time}{x.durationMinutes ? ` · ${x.durationMinutes} min` : ''}</span>
            {x.client && <span className="meta-chip"><Icon name="building" size={13} />{label(x.client)}</span>}
            {x.requirementRef && <span className="meta-chip">RQ {x.requirementRef}</span>}
            {x.talentBlacklisted && <span className="badge badge-danger" data-testid="iv-blacklisted"><Icon name="ban" size={12} /> {t('interviews.blacklisted')}</span>}
          </div>
        </div>
        <div className="pf-actions">
          {!isPhone && <button className="icon-ghost bordered" onClick={downloadIcs} aria-label={t('interviews.ics')} title={t('interviews.ics')} data-testid="iv-ics"><Icon name="calendar" size={16} /></button>}
          {can('interview.write') && <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)} data-testid="edit-interview"><Icon name="edit" size={15} />{t('interviews.edit')}</button>}
        </div>
      </header>
      <div className="pf-body">
        <div className="pf-main">
          {x.cancelReason && <section className="pf-section"><header><h3>{t('interviews.cancelReason')}</h3></header><p className="pf-text pre">{x.cancelReason}</p></section>}
          {(x.meetingLink || x.address) && <section className="pf-section"><header><h3>{x.meetingLink ? t('interviews.link') : t('interviews.address')}</h3></header>
            {x.meetingLink && <a href={x.meetingLink} target="_blank" rel="noopener noreferrer">{x.meetingLink}</a>}
            {x.address && <p className="pf-text">{x.address} {x.locationUrl && <a href={x.locationUrl} target="_blank" rel="noopener noreferrer">· {t('interviews.openMap')}</a>}</p>}
          </section>}
          {isPhone && <section className="pf-section"><header><h3>{t('interviews.tab.questions')}</h3></header>
            {x.answers.map((a, i) => (
              <div key={a.questionId} className="pf-item" data-testid="iv-answer">
                <div className="grow">
                  <div className="pf-item-meta">{i + 1}. {label(a.question)}{!a.active && ` · ${t('interviews.retiredQuestion')}`}</div>
                  <div className="pf-text pre">{a.answer || <span className="muted">—</span>}</div>
                </div>
              </div>
            ))}
          </section>}
          <section className="pf-section"><header><h3>{t('interviews.tab.evaluation')}</h3></header>
            <div className="row"><Stars value={x.ratingGeneral} size={16} /><span className="muted">{x.ratingGeneral ? t(`interviews.ratingLabel.${x.ratingGeneral}`) : t('interviews.unrated')}</span></div>
            {!isPhone && areas.map(([k, r, n]) => (
              <div key={k} className="pf-item">
                <div className="grow"><div className="row" style={{ gap: 8 }}><span className="pf-item-title">{t(`interviews.area.${k}`)}</span><Stars value={r} size={11} /></div>
                  {n && <p className="pf-text pre">{n}</p>}</div>
              </div>
            ))}
          </section>
        </div>
        <aside className="pf-aside">
          <section className="pf-section"><header><h3>{t('interviews.tab.interviewers')}</h3></header>
            {x.interviewers.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
            {x.interviewers.map((iv, i) => (
              <div key={i} className="pf-item compact"><div className="grow"><div className="pf-item-title">{iv.name}</div>{iv.email && <div className="pf-item-meta">{iv.email}</div>}</div></div>
            ))}
          </section>
          {x.typeCode === 'VIRTUAL' && <section className="pf-section"><header><h3>{t('interviews.tab.recordings')}</h3></header>
            {x.recordings.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
            {x.recordings.map((r, i) => <div key={i} className="pf-item compact"><a href={r.url} target="_blank" rel="noopener noreferrer" className="link-btn">{r.url}</a><span className="pf-item-meta">{r.date}</span></div>)}
          </section>}
          {!isPhone && <InterviewFiles interview={x} canWrite={can('interview.write')} onChanged={() => q.refetch()} />}
          <p className="pf-item-meta">{t('talents.updated')}: {formatDate(x.updatedAt, i18n.language)}</p>
        </aside>
      </div>
      {editing && <InterviewEditor interview={x} onClose={() => setEditing(false)} onSaved={() => {
        setEditing(false); toast.success(t('interviews.saved'));
        qc.invalidateQueries({ queryKey: ['interview', id] }); qc.invalidateQueries({ queryKey: ['interviews'] });
      }} />}
    </div>
  );
}
