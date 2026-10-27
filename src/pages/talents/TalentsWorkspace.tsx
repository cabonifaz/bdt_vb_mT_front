import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { useTalentFilters } from '../../providers/talentFilters';
import {
  cachedGet, cachedPost, EMPTY_FILTERS, fullName, TALENT_API, useLabel, useMasters,
  type Collection, type TalentFilters, type TalentSummary,
} from '../../lib/talents';
import { useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { Chip, Pagination, Stars, TalentPhoto } from '../../components/talents/bits';
import { TalentEditor } from './TalentEditor';

const PAGE_SIZE = 25;

/**
 * Columna angosta (ancho similar al menú) con buscador, filtros desplegables y lista;
 * la ficha del talento ocupa todo el resto de la pantalla.
 * Los filtros viven en memoria (nunca en la URL) y la búsqueda viaja por POST.
 */
export function TalentsWorkspace() {
  const { tenant = '', id: selectedId } = useParams();
  const { t } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const errText = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const masters = useMasters();
  const { filters: f, setFilters } = useTalentFilters();
  const [text, setText] = useState({ search: f.search, position: f.position, education: f.education });
  const [skillText, setSkillText] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(false);

  const update = (patch: Partial<TalentFilters>) => setFilters({ ...f, ...patch, page: 'page' in patch ? patch.page! : 1 });

  // campos de texto: se aplican tras una pausa corta
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (text.search !== f.search || text.position !== f.position || text.education !== f.education) update(text);
    }, 350);
    return () => window.clearTimeout(h);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = useMemo(() => ({
    search: f.search, skills: f.skills, englishLevel: f.englishLevel, minYears: f.minYears === '' ? null : Number(f.minYears),
    position: f.position, education: f.education, gradeId: f.gradeId, collectionId: f.collectionId, status: f.status,
    page: f.page, pageSize: PAGE_SIZE,
  }), [f]);
  const list = useQuery({
    queryKey: ['talents', body],
    queryFn: () => cachedPost<{ total: number; items: TalentSummary[] }>(`${TALENT_API}/search`, body),
    placeholderData: (prev) => prev,
  });
  const collections = useQuery({ queryKey: ['collections'], queryFn: () => cachedGet<Collection[]>('/api/v1/tenant/collections') });

  const techSkills = masters.byTable('TECH_SKILL');
  const levels = masters.byTable('LANGUAGE_LEVEL');
  const grades = masters.byTable('ACADEMIC_GRADE');
  const addSkill = (name: string) => {
    const item = techSkills.find((s) => label(s.label).toLowerCase() === name.trim().toLowerCase());
    if (item && !f.skills.includes(item.id)) update({ skills: [...f.skills, item.id] });
    setSkillText('');
  };
  // filtros avanzados activos (el buscador se ve siempre)
  const active = [f.skills.length > 0, !!f.englishLevel, !!f.minYears, !!f.position, !!f.education, !!f.gradeId, !!f.collectionId, !!f.status].filter(Boolean).length;
  const clear = () => { setText({ search: '', position: '', education: '' }); setFilters(EMPTY_FILTERS); };
  const chips: { key: string; text: string; remove: () => void }[] = [
    ...f.skills.map((sid) => ({ key: sid, text: label(techSkills.find((x) => x.id === sid)?.label) || '…', remove: () => update({ skills: f.skills.filter((x) => x !== sid) }) })),
    ...(f.englishLevel ? [{ key: 'en', text: `EN ≥ ${label(levels.find((l) => l.code === f.englishLevel)?.label)}`, remove: () => update({ englishLevel: '' }) }] : []),
    ...(f.minYears ? [{ key: 'yrs', text: `≥ ${f.minYears} ${t('talents.yearsShort').toLowerCase()}`, remove: () => update({ minYears: '' }) }] : []),
    ...(f.position ? [{ key: 'pos', text: f.position, remove: () => { setText({ ...text, position: '' }); update({ position: '' }); } }] : []),
    ...(f.education ? [{ key: 'edu', text: f.education, remove: () => { setText({ ...text, education: '' }); update({ education: '' }); } }] : []),
    ...(f.gradeId ? [{ key: 'grade', text: label(grades.find((g) => g.id === f.gradeId)?.label), remove: () => update({ gradeId: '' }) }] : []),
    ...(f.collectionId ? [{ key: 'coll', text: `♥ ${collections.data?.find((c) => c.id === f.collectionId)?.name ?? ''}`, remove: () => update({ collectionId: '' }) }] : []),
    ...(f.status ? [{ key: 'st', text: t('talents.archived'), remove: () => update({ status: '' }) }] : []),
  ];

  return (
    <div className="ws">
      <aside className="ws-side" aria-label={t('talents.title')}>
        <div className="ws-side-head">
          <h1>{t('talents.title')}</h1>
          {list.data && <span className="muted" data-testid="talent-count">{list.data.total}</span>}
          <span className="spacer" />
          {can('talent.write') && (
            <button className="btn btn-primary btn-sm icon-btn" onClick={() => setCreating(true)} aria-label={t('talents.new')} title={t('talents.new')} data-testid="new-talent">
              <Icon name="plus" size={18} />
            </button>
          )}
        </div>
        <div className="ws-side-search">
          <label htmlFor="f-search" className="sr-only">{t('common.search')}</label>
          <input id="f-search" className="input" type="search" placeholder={t('talents.searchPlaceholder')} value={text.search}
            onChange={(e) => setText({ ...text, search: e.target.value })} aria-label={t('common.search')} />
          <button className={`btn btn-sm ${showFilters || active ? 'btn-secondary' : 'btn-ghost'} icon-btn filter-btn`} onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters} aria-controls="talent-filters" aria-label={t('talents.filters')} title={t('talents.filters')} data-testid="toggle-filters">
            <Icon name="filter" size={16} />{active > 0 && <span className="filter-count">{active}</span>}
          </button>
        </div>

        {showFilters && (
          <div id="talent-filters" className="ws-filters stack" role="region" aria-label={t('talents.filters')}>
            <div className="field">
              <label htmlFor="f-skill">{t('talents.skills')}</label>
              <input id="f-skill" className="input" list="dl-filter-skills" placeholder={t('talents.skillPlaceholder')} value={skillText}
                onChange={(e) => { setSkillText(e.target.value); if (techSkills.some((s) => label(s.label) === e.target.value)) addSkill(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillText); } }} />
              <datalist id="dl-filter-skills">{techSkills.map((s) => <option key={s.id} value={label(s.label)} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="f-en">{t('talents.englishLevel')}</label>
              <select id="f-en" className="select" value={f.englishLevel} onChange={(e) => update({ englishLevel: e.target.value })}>
                <option value="">{t('talents.any')}</option>{levels.map((l) => <option key={l.id} value={l.code}>{label(l.label)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-years">{t('talents.minYears')}</label>
              <input id="f-years" className="input" type="number" min={0} max={60} value={f.minYears} onChange={(e) => update({ minYears: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-pos">{t('talents.position')}</label>
              <input id="f-pos" className="input" value={text.position} onChange={(e) => setText({ ...text, position: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-edu">{t('talents.education')}</label>
              <input id="f-edu" className="input" value={text.education} onChange={(e) => setText({ ...text, education: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-grade">{t('talents.grade')}</label>
              <select id="f-grade" className="select" value={f.gradeId} onChange={(e) => update({ gradeId: e.target.value })}>
                <option value="">{t('talents.any')}</option>{grades.map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-coll">{t('talents.collection')}</label>
              <select id="f-coll" className="select" value={f.collectionId} onChange={(e) => update({ collectionId: e.target.value })}>
                <option value="">{t('talents.any')}</option>{collections.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.talentCount})</option>)}
              </select>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={f.status === 'ARCHIVED'} onChange={(e) => update({ status: e.target.checked ? 'ARCHIVED' : '' })} />
              {t('talents.archived')}
            </label>
          </div>
        )}

        {(chips.length > 0 || f.search) && (
          <div className="ws-chips">
            {chips.map((c) => <Chip key={c.key} onRemove={c.remove} removeLabel={t('talents.delete')}>{c.text}</Chip>)}
            <button className="btn btn-ghost btn-sm" onClick={clear} data-testid="clear-filters">{t('talents.clearFilters')}</button>
          </div>
        )}

        <nav className="ws-list" aria-label={t('talents.title')} aria-busy={list.isFetching || undefined}>
          {list.isError && <div className="alert alert-error" role="alert">{errText(list.error)}</div>}
          {list.isLoading && <p className="muted">{t('common.loading')}</p>}
          {list.data?.items.map((x) => (
            <Link key={x.id} to={`/${tenant}/talentos/${x.id}`} className={`talent-row${x.id === selectedId ? ' active' : ''}`}
              aria-current={x.id === selectedId ? 'true' : undefined} data-testid="talent-card">
              <TalentPhoto fileId={x.photoId} name={fullName(x)} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <span className="name" style={{ flex: 1 }}>{fullName(x)}</span>
                  {x.isFavorite && <span className="fav on" style={{ fontSize: 12 }} aria-label={t('talents.favorite')}>♥</span>}
                </div>
                <div className="sub">{x.headline || '—'}</div>
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <Stars value={x.avgRating} size={10} />
                  <span className="sub">{t('talents.yearsExp', { years: x.yearsExperience })}</span>
                </div>
              </div>
            </Link>
          ))}
          {list.data?.items.length === 0 && <div className="empty" style={{ padding: 16 }}>{t('talents.noResults')}</div>}
          {list.data && list.data.total > PAGE_SIZE && (
            <Pagination page={f.page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => update({ page: p })}
              labels={{ prev: '‹', next: '›', of: t('talents.of') }} />
          )}
        </nav>
      </aside>

      <section className="ws-detail" aria-live="polite">
        <Outlet />
      </section>

      {creating && <TalentEditor onClose={() => setCreating(false)} onSaved={(id, offline) => {
        setCreating(false);
        qc.invalidateQueries({ queryKey: ['talents'] });
        if (offline) toast.info(t('talents.savedOffline'));
        else { toast.success(t('talents.saved')); nav(`/${tenant}/talentos/${id}`); }
      }} />}
    </div>
  );
}

export function TalentPlaceholder() {
  const { t } = useTranslation();
  return <div className="ws-empty"><div className="stack" style={{ alignItems: 'center' }}><Icon name="talents" size={40} /><p>{t('talents.selectOne')}</p></div></div>;
}
