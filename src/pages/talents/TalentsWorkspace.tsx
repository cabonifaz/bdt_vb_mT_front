import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { cachedGet, fullName, TALENT_API, useLabel, useMasters, type Collection, type TalentSummary } from '../../lib/talents';
import { Button, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { Chip, Pagination, Stars, TalentPhoto } from '../../components/talents/bits';
import { TalentEditor } from './TalentEditor';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['search', 'skills', 'englishLevel', 'minYears', 'position', 'education', 'gradeId', 'collectionId', 'status'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

/** Filtros arriba (siempre visibles), lista a la izquierda (siempre visible) y ficha a la derecha. */
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
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [position, setPosition] = useState(params.get('position') ?? '');
  const [education, setEducation] = useState(params.get('education') ?? '');
  const [skillText, setSkillText] = useState('');
  const [creating, setCreating] = useState(false);

  const update = (patch: Partial<Record<FilterKey | 'page', string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // campos de texto: se aplican tras una pausa corta
  useEffect(() => {
    const h = window.setTimeout(() => {
      const patch: Partial<Record<FilterKey, string>> = {};
      if ((params.get('search') ?? '') !== search) patch.search = search;
      if ((params.get('position') ?? '') !== position) patch.position = position;
      if ((params.get('education') ?? '') !== education) patch.education = education;
      if (Object.keys(patch).length) update(patch);
    }, 350);
    return () => window.clearTimeout(h);
  }, [search, position, education]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => {
    const q = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { const v = params.get(k); if (v) q.set(k, v); });
    q.set('page', String(page));
    q.set('pageSize', String(PAGE_SIZE));
    return q.toString();
  }, [params, page]);

  const list = useQuery({ queryKey: ['talents', query], queryFn: () => cachedGet<{ total: number; items: TalentSummary[] }>(`${TALENT_API}?${query}`), placeholderData: (prev) => prev });
  const collections = useQuery({ queryKey: ['collections'], queryFn: () => cachedGet<Collection[]>('/api/v1/tenant/collections') });

  const selectedSkills = (params.get('skills') ?? '').split(',').filter(Boolean);
  const techSkills = masters.byTable('TECH_SKILL');
  const levels = masters.byTable('LANGUAGE_LEVEL');
  const grades = masters.byTable('ACADEMIC_GRADE');
  const addSkill = (name: string) => {
    const item = techSkills.find((s) => label(s.label).toLowerCase() === name.trim().toLowerCase());
    if (item && !selectedSkills.includes(item.id)) update({ skills: [...selectedSkills, item.id].join(',') });
    setSkillText('');
  };
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;
  const qs = params.toString() ? `?${params.toString()}` : '';
  const clear = () => { setSearch(''); setPosition(''); setEducation(''); setParams(new URLSearchParams(), { replace: true }); };

  return (
    <div className="ws">
      <div className="ws-head">
        <h1>{t('talents.title')}</h1>
        {list.data && <span className="muted" data-testid="talent-count">{t('talents.results', { count: list.data.total })}</span>}
        {activeFilters > 0 && <button className="btn btn-ghost btn-sm" onClick={clear} data-testid="clear-filters"><Icon name="x" size={16} />{t('talents.clearFilters')} ({activeFilters})</button>}
        <span className="spacer" />
        {can('talent.write') && <Button onClick={() => setCreating(true)} data-testid="new-talent"><Icon name="plus" size={18} />{t('talents.new')}</Button>}
      </div>

      <section className="ws-filters" aria-label={t('talents.filters')}>
        <div className="grid">
          <div className="field">
            <label htmlFor="f-search">{t('common.search')}</label>
            <input id="f-search" className="input" type="search" placeholder={t('talents.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-skill">{t('talents.skills')}</label>
            <input id="f-skill" className="input" list="dl-filter-skills" placeholder={t('talents.skillPlaceholder')} value={skillText}
              onChange={(e) => { setSkillText(e.target.value); if (techSkills.some((s) => label(s.label) === e.target.value)) addSkill(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillText); } }} />
            <datalist id="dl-filter-skills">{techSkills.map((s) => <option key={s.id} value={label(s.label)} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="f-en">{t('talents.englishLevel')}</label>
            <select id="f-en" className="select" value={params.get('englishLevel') ?? ''} onChange={(e) => update({ englishLevel: e.target.value })}>
              <option value="">{t('talents.any')}</option>{levels.map((l) => <option key={l.id} value={l.code}>{label(l.label)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-years">{t('talents.minYears')}</label>
            <input id="f-years" className="input" type="number" min={0} max={60} value={params.get('minYears') ?? ''} onChange={(e) => update({ minYears: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="f-pos">{t('talents.position')}</label>
            <input id="f-pos" className="input" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-edu">{t('talents.education')}</label>
            <input id="f-edu" className="input" value={education} onChange={(e) => setEducation(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-grade">{t('talents.grade')}</label>
            <select id="f-grade" className="select" value={params.get('gradeId') ?? ''} onChange={(e) => update({ gradeId: e.target.value })}>
              <option value="">{t('talents.any')}</option>{grades.map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-coll">{t('talents.collection')}</label>
            <select id="f-coll" className="select" value={params.get('collectionId') ?? ''} onChange={(e) => update({ collectionId: e.target.value })}>
              <option value="">{t('talents.any')}</option>{collections.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.talentCount})</option>)}
            </select>
          </div>
          <label className="checkbox" style={{ height: 34 }}>
            <input type="checkbox" checked={params.get('status') === 'ARCHIVED'} onChange={(e) => update({ status: e.target.checked ? 'ARCHIVED' : '' })} />
            {t('talents.archived')}
          </label>
        </div>
        {selectedSkills.length > 0 && (
          <div className="row" style={{ gap: 6 }}>
            {selectedSkills.map((sid) => {
              const s = techSkills.find((x) => x.id === sid);
              return <Chip key={sid} removeLabel={t('talents.delete')} onRemove={() => update({ skills: selectedSkills.filter((x) => x !== sid).join(',') })}>{s ? label(s.label) : '…'}</Chip>;
            })}
          </div>
        )}
      </section>

      <div className="ws-body">
        <nav className="ws-list" aria-label={t('talents.title')} aria-busy={list.isFetching || undefined}>
          {list.isError && <div className="alert alert-error" role="alert">{errText(list.error)}</div>}
          {list.isLoading && <p className="muted">{t('common.loading')}</p>}
          {list.data?.items.map((x) => (
            <Link key={x.id} to={`/${tenant}/talentos/${x.id}${qs}`} className={`talent-row${x.id === selectedId ? ' active' : ''}`}
              aria-current={x.id === selectedId ? 'true' : undefined} data-testid="talent-card">
              <TalentPhoto fileId={x.photoId} name={fullName(x)} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 6, flexWrap: 'nowrap' }}>
                  <span className="name">{fullName(x)}</span>
                  {x.isFavorite && <span className="fav on" style={{ fontSize: 14 }} aria-label={t('talents.favorite')}>♥</span>}
                </div>
                <div className="sub">{x.headline || '—'}</div>
                <div className="sub">{t('talents.yearsExp', { years: x.yearsExperience })}{x.englishLevel ? ` · EN ${label(levels.find((l) => l.code === x.englishLevel)?.label)}` : ''}</div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <Stars value={x.avgRating} size={12} />
                  <span className="sub" style={{ flex: 1 }}>{x.skills.slice(0, 3).map((s) => label(s.label)).join(' · ')}</span>
                </div>
              </div>
            </Link>
          ))}
          {list.data?.items.length === 0 && <div className="empty">{t('talents.noResults')}</div>}
          {list.data && list.data.total > PAGE_SIZE && (
            <Pagination page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => update({ page: String(p) })}
              labels={{ prev: t('talents.prev'), next: t('talents.next'), of: t('talents.of') }} />
          )}
        </nav>
        <section className="ws-detail" aria-live="polite">
          <Outlet />
        </section>
      </div>

      {creating && <TalentEditor onClose={() => setCreating(false)} onSaved={(id, offline) => {
        setCreating(false);
        qc.invalidateQueries({ queryKey: ['talents'] });
        if (offline) toast.info(t('talents.savedOffline'));
        else { toast.success(t('talents.saved')); nav(`/${tenant}/talentos/${id}${qs}`); }
      }} />}
    </div>
  );
}

export function TalentPlaceholder() {
  const { t } = useTranslation();
  return <div className="ws-empty"><div className="stack" style={{ alignItems: 'center' }}><Icon name="talents" size={40} /><p>{t('talents.selectOne')}</p></div></div>;
}
