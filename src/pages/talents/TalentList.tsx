import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { cachedGet, fullName, TALENT_API, useLabel, useMasters, type Collection, type TalentSummary } from '../../lib/talents';
import { Card, useErrorText } from '../../components/ui';
import { Chip, Pagination, Stars, TalentPhoto } from '../../components/talents/bits';

const PAGE_SIZE = 10;
const FILTER_KEYS = ['search', 'skills', 'englishLevel', 'minYears', 'position', 'education', 'gradeId', 'collectionId', 'status'] as const;

export function TalentList() {
  const { tenant = '' } = useParams();
  const { t } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const errText = useErrorText();
  const masters = useMasters();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [skillText, setSkillText] = useState('');

  // búsqueda con espera corta para no consultar en cada tecla
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ((params.get('search') ?? '') !== search) update({ search });
    }, 350);
    return () => window.clearTimeout(id);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<Record<(typeof FILTER_KEYS)[number] | 'page', string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const query = useMemo(() => {
    const q = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { const v = params.get(k); if (v) q.set(k, v); });
    q.set('page', String(page));
    q.set('pageSize', String(PAGE_SIZE));
    return q.toString();
  }, [params, page]);

  const list = useQuery({ queryKey: ['talents', query], queryFn: () => cachedGet<{ total: number; items: TalentSummary[] }>(`${TALENT_API}?${query}`) });
  const collections = useQuery({ queryKey: ['collections'], queryFn: () => cachedGet<Collection[]>('/api/v1/tenant/collections') });

  const selectedSkills = (params.get('skills') ?? '').split(',').filter(Boolean);
  const techSkills = masters.byTable('TECH_SKILL');
  const addSkill = (name: string) => {
    const item = techSkills.find((s) => label(s.label).toLowerCase() === name.trim().toLowerCase());
    if (item && !selectedSkills.includes(item.id)) update({ skills: [...selectedSkills, item.id].join(',') });
    setSkillText('');
  };
  const levels = masters.byTable('LANGUAGE_LEVEL');
  const grades = masters.byTable('ACADEMIC_GRADE');

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('talents.title')}</h1><p className="muted">{t('talents.subtitle')}</p></div>
        {can('talent.write') && <Link className="btn btn-primary" to={`/${tenant}/talentos/nuevo`}>{t('talents.new')}</Link>}
      </div>

      <div className="talent-layout">
        <aside className="filters" aria-label={t('talents.filters')}>
          <Card title={t('talents.filters')} actions={
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setParams(new URLSearchParams(), { replace: true }); }}>{t('talents.clearFilters')}</button>}>
            <div className="stack">
              <div className="field">
                <label htmlFor="f-search">{t('common.search')}</label>
                <input id="f-search" className="input" type="search" placeholder={t('talents.searchPlaceholder')} value={search}
                  onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-skill">{t('talents.skills')}</label>
                <input id="f-skill" className="input" list="dl-filter-skills" placeholder={t('talents.skillPlaceholder')} value={skillText}
                  onChange={(e) => { setSkillText(e.target.value); if (techSkills.some((s) => label(s.label) === e.target.value)) addSkill(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillText); } }} />
                <datalist id="dl-filter-skills">{techSkills.map((s) => <option key={s.id} value={label(s.label)} />)}</datalist>
                <div className="chips">
                  {selectedSkills.map((id) => {
                    const s = techSkills.find((x) => x.id === id);
                    return <Chip key={id} removeLabel={t('talents.delete')} onRemove={() => update({ skills: selectedSkills.filter((x) => x !== id).join(',') })}>{s ? label(s.label) : '…'}</Chip>;
                  })}
                </div>
              </div>
              <div className="field">
                <label htmlFor="f-en">{t('talents.englishLevel')}</label>
                <select id="f-en" className="select" value={params.get('englishLevel') ?? ''} onChange={(e) => update({ englishLevel: e.target.value })}>
                  <option value="">{t('talents.any')}</option>
                  {levels.map((l) => <option key={l.id} value={l.code}>{label(l.label)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-years">{t('talents.minYears')}</label>
                <input id="f-years" className="input" type="number" min={0} max={60} value={params.get('minYears') ?? ''} onChange={(e) => update({ minYears: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-pos">{t('talents.position')}</label>
                <input id="f-pos" className="input" defaultValue={params.get('position') ?? ''} onBlur={(e) => update({ position: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') update({ position: (e.target as HTMLInputElement).value }); }} />
              </div>
              <div className="field">
                <label htmlFor="f-edu">{t('talents.education')}</label>
                <input id="f-edu" className="input" defaultValue={params.get('education') ?? ''} onBlur={(e) => update({ education: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') update({ education: (e.target as HTMLInputElement).value }); }} />
              </div>
              <div className="field">
                <label htmlFor="f-grade">{t('talents.grade')}</label>
                <select id="f-grade" className="select" value={params.get('gradeId') ?? ''} onChange={(e) => update({ gradeId: e.target.value })}>
                  <option value="">{t('talents.any')}</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{label(g.label)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-coll">{t('talents.collection')}</label>
                <select id="f-coll" className="select" value={params.get('collectionId') ?? ''} onChange={(e) => update({ collectionId: e.target.value })}>
                  <option value="">{t('talents.any')}</option>
                  {collections.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.talentCount})</option>)}
                </select>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={params.get('status') === 'ARCHIVED'} onChange={(e) => update({ status: e.target.checked ? 'ARCHIVED' : '' })} />
                {t('talents.archived')}
              </label>
            </div>
          </Card>
        </aside>

        <section className="stack" aria-live="polite">
          {list.isError && <div className="alert alert-error" role="alert">{errText(list.error)}</div>}
          {list.data && <p className="muted" data-testid="talent-count">{t('talents.results', { count: list.data.total })}</p>}
          {list.isLoading && <p className="muted">{t('common.loading')}</p>}
          <div className="talent-list">
            {list.data?.items.map((x) => (
              <Link key={x.id} to={`/${tenant}/talentos/${x.id}`} className="talent-card" data-testid="talent-card">
                <TalentPhoto fileId={x.photoId} name={fullName(x)} size={56} />
                <div className="grow stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3>{fullName(x)}</h3>
                    <span className="row" style={{ gap: 8 }}>
                      {x.isFavorite && <span className="fav on" aria-label={t('talents.favorite')}>♥</span>}
                      <Stars value={x.avgRating} />
                    </span>
                  </div>
                  {x.headline && <div style={{ fontWeight: 500 }}>{x.headline}</div>}
                  <div className="meta">
                    {(x.country || x.city) && <span>{[x.city, label(x.country)].filter(Boolean).join(', ')}</span>}
                    <span>{t('talents.yearsExp', { years: x.yearsExperience })}</span>
                    {x.englishLevel && <span>EN: {label(levels.find((l) => l.code === x.englishLevel)?.label)}</span>}
                  </div>
                  <div className="chips">
                    {x.skills.slice(0, 8).map((s) => <Chip key={s.id}>{label(s.label)}{s.years ? <small>{s.years}a</small> : null}</Chip>)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {list.data?.items.length === 0 && <div className="card empty">{t('talents.noResults')}</div>}
          {list.data && list.data.total > PAGE_SIZE && (
            <Pagination page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => update({ page: String(p) })}
              labels={{ prev: t('talents.prev'), next: t('talents.next'), of: t('talents.of') }} />
          )}
        </section>
      </div>
    </div>
  );
}
