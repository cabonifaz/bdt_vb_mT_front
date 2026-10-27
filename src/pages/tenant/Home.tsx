// Inicio del usuario: lo que tiene hoy y en los próximos días, los últimos talentos y su carga del mes.
// Los requerimientos (RQ) son de ejemplo hasta integrar AutFMI por API.
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '../../providers/auth';
import { cachedGet, fullName, useLabel, type I18nLabel } from '../../lib/talents';
import { requirementsMock, type RqMock } from '../../lib/requirementsMock';
import { TalentPhoto } from '../../components/talents/bits';
import { Icon } from '../../components/ui/Icon';
import { Loader } from '../../components/ui/Loader';
import { useErrorText } from '../../components/ui';

type HomeInterview = {
  id: string; talentId: string; firstName: string; lastName: string; secondLastName?: string; typeCode: string;
  stage: I18nLabel; statusCode: string; client?: I18nLabel; requirementRef?: string; profile: string; date: string; time: string; isMine: boolean;
};
type HomeTalent = { id: string; firstName: string; lastName: string; secondLastName?: string; headline?: string; photoId?: string; createdAt: string; isNew: boolean };
type MonthStats = { month: string; myPlanned: number; myDone: number; areaPlanned: number; areaDone: number; talentsNew: number; myTalentsNew: number };
type HomeSummary = { today: string; interviews: HomeInterview[]; talents: HomeTalent[]; months: MonthStats[] };

const IV_ICON: Record<string, string> = { VIRTUAL: 'video', IN_PERSON: 'mapPin', PHONE: 'phoneCall' };

export function Home() {
  const { t, i18n } = useTranslation();
  const { user, can } = useAuth();
  const label = useLabel();
  const errText = useErrorText();
  const tenant = user?.tenantSlug ?? '';
  const q = useQuery({ queryKey: ['home'], queryFn: () => cachedGet<HomeSummary>('/api/v1/tenant/home'), refetchInterval: 5 * 60_000 });

  const header = (
    <div className="page-header">
      <div>
        <h1>{t('home.welcome', { name: user?.fullName.split(' ')[0] })}</h1>
        <p className="muted home-date">{q.data && fmtDate(q.data.today, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
    </div>
  );
  if (q.isLoading) return <div className="page">{header}<Loader /></div>;
  if (q.isError || !q.data) return <div className="page">{header}<div className="alert alert-error" role="alert">{errText(q.error)}</div></div>;

  const h = q.data;
  const rq = requirementsMock(h.today);
  const [, prev, cur] = h.months.length === 3 ? h.months : [undefined, undefined, h.months[h.months.length - 1]];
  const rqPrev = rq.months[1];
  const rqCur = rq.months[2];
  const todayIvs = h.interviews.filter((i) => i.date === h.today);
  const new24 = h.talents.filter((x) => x.isNew).length;
  const showIv = can('interview.read');

  // agenda agrupada por día
  const days = new Map<string, HomeInterview[]>();
  h.interviews.forEach((iv) => days.set(iv.date, [...(days.get(iv.date) ?? []), iv]));
  const dayLabel = (d: string) => {
    if (d === h.today) return t('home.today');
    if (d === addDays(h.today, 1)) return t('home.tomorrow');
    return fmtDate(d, i18n.language, { weekday: 'long', day: 'numeric', month: 'short' });
  };

  return (
    <div className="page home">
      {header}

      <div className="kpis" data-testid="home-kpis">
        {showIv && <Kpi icon="calendar" title={t('home.kpiToday')} value={todayIvs.length}
          sub={t('home.kpiTodayMine', { count: todayIvs.filter((i) => i.isMine).length })} />}
        {showIv && cur && <Kpi icon="user" title={t('home.kpiMine')} value={cur.myDone} of={cur.myPlanned}
          delta={prev ? cur.myDone - prev.myDone : undefined} sub={t('home.doneOfPlanned')} />}
        {showIv && cur && <Kpi icon="interviews" title={t('home.kpiArea')} value={cur.areaDone} of={cur.areaPlanned}
          delta={prev ? cur.areaDone - prev.areaDone : undefined} sub={t('home.doneOfPlanned')} />}
        {cur && <Kpi icon="talents" title={t('home.kpiTalents')} value={cur.talentsNew}
          delta={prev ? cur.talentsNew - prev.talentsNew : undefined} sub={t('home.kpiTalentsMine', { count: cur.myTalentsNew })} />}
        <Kpi icon="briefcase" title={t('home.kpiHires')} value={rqCur.withHires} delta={rqCur.withHires - rqPrev.withHires}
          sub={t('home.kpiHiresSub', { count: rqCur.hires })} demo />
      </div>

      <div className="home-grid">
        {showIv && (
          <Panel title={t('home.agenda')} icon="calendar" testId="home-agenda"
            action={<Link to={`/${tenant}/entrevistas`} className="link-btn">{t('home.seeAll')}</Link>}>
            {h.interviews.length === 0 && <Empty>{t('home.noInterviews')}</Empty>}
            {[...days.entries()].map(([d, ivs]) => (
              <div key={d} className="agenda-day">
                <h4 className={d === h.today ? 'is-today' : undefined}>{dayLabel(d)} <span className="count">{ivs.length}</span></h4>
                <ul className="home-list">
                  {ivs.map((iv) => (
                    <li key={iv.id}>
                      <Link to={`/${tenant}/entrevistas/${iv.id}`} className="home-row">
                        <span className="agenda-time">{iv.time}</span>
                        <span className="home-ico"><Icon name={IV_ICON[iv.typeCode] ?? 'calendar'} size={15} /></span>
                        <span className="home-main">
                          <strong>{fullName(iv)}</strong>
                          <span className="muted">{[iv.profile, label(iv.client), label(iv.stage)].filter(Boolean).join(' · ')}</span>
                        </span>
                        {iv.isMine && <span className="badge badge-info">{t('home.mine')}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Panel>
        )}

        <Panel title={t('home.latestTalents')} icon="talents" testId="home-talents"
          action={new24 > 0 ? <span className="badge badge-success">{t('home.new24', { count: new24 })}</span> : undefined}>
          {h.talents.length === 0 && <Empty>{t('home.noTalents')}</Empty>}
          <ul className="home-list">
            {h.talents.map((x) => (
              <li key={x.id}>
                <Link to={`/${tenant}/talentos/${x.id}`} className="home-row">
                  <TalentPhoto fileId={x.photoId} name={fullName(x)} size={30} />
                  <span className="home-main">
                    <strong>{fullName(x)}</strong>
                    <span className="muted">{x.headline || '—'}</span>
                  </span>
                  <span className="muted home-when" title={new Date(x.createdAt).toLocaleString(i18n.language)}>{ago(x.createdAt, i18n.language)}</span>
                  {x.isNew && <span className="badge badge-success">{t('home.new')}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="home-grid home-grid-3">
        <Panel title={t('home.rqDueToday')} icon="alert" demo testId="home-rq-due">
          <RqList items={rq.dueToday} empty={t('home.rqNoneDue')} meta={(r) => t('home.rqCovered', { covered: r.covered, total: r.vacancies })} />
        </Panel>
        <Panel title={t('home.rqNew')} icon="briefcase" demo testId="home-rq-new">
          <RqList items={rq.newest} empty={t('home.rqNone')} meta={(r) => fmtDate(r.requestedAt, i18n.language, { day: 'numeric', month: 'short' })} />
        </Panel>
        <Panel title={t('home.rqApplicants')} icon="users" demo testId="home-rq-applicants">
          <RqList items={rq.mostApplicants} empty={t('home.rqNone')} meta={(r) => t('home.applicants', { count: r.applicants })} />
        </Panel>
      </div>

      <Panel title={t('home.last3')} icon="chart" testId="home-months">
        <div className="table-wrap">
          <table className="table home-months">
            <thead>
              <tr>
                <th>{t('home.month')}</th>
                {showIv && <th>{t('home.colMine')}</th>}
                {showIv && <th>{t('home.colArea')}</th>}
                <th>{t('home.colTalents')}</th>
                <th>{t('home.colHires')} <span className="badge badge-neutral">{t('home.demo')}</span></th>
              </tr>
            </thead>
            <tbody>
              {h.months.map((m, i) => (
                <tr key={m.month} className={i === h.months.length - 1 ? 'is-current' : undefined}>
                  <td>{fmtMonth(m.month, i18n.language)}</td>
                  {showIv && <td><Ratio done={m.myDone} planned={m.myPlanned} /></td>}
                  {showIv && <td><Ratio done={m.areaDone} planned={m.areaPlanned} /></td>}
                  <td className="num">{m.talentsNew}</td>
                  <td className="num">{rq.months[i]?.withHires ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Kpi({ icon, title, value, of, delta, sub, demo }: { icon: string; title: string; value: number; of?: number; delta?: number; sub?: string; demo?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="kpi">
      <div className="kpi-title"><Icon name={icon} size={15} />{title}{demo && <span className="badge badge-neutral">{t('home.demo')}</span>}</div>
      <div className="kpi-value">{value}{of !== undefined && <span className="kpi-of">/ {of}</span>}</div>
      <div className="kpi-foot">
        {delta !== undefined && (
          <span className={`kpi-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`} title={t('home.vsLastMonth')}>
            <Icon name={delta > 0 ? 'trendUp' : delta < 0 ? 'trendDown' : 'minus'} size={13} />{delta > 0 ? `+${delta}` : delta} {t('home.vsLastMonthShort')}
          </span>
        )}
        {sub && <span className="muted">{sub}</span>}
      </div>
    </div>
  );
}

function Panel({ title, icon, action, demo, testId, children }: { title: string; icon: string; action?: ReactNode; demo?: boolean; testId?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="card home-panel" data-testid={testId}>
      <header className="card-header">
        <h3><Icon name={icon} size={16} />{title}</h3>
        {demo && <span className="badge badge-neutral" title={t('home.demoHint')}>{t('home.demo')}</span>}
        <span className="spacer" />{action}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

function RqList({ items, empty, meta }: { items: RqMock[]; empty: string; meta: (r: RqMock) => string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="home-list">
      {items.map((r) => (
        <li key={r.id} className="home-row">
          <span className="home-main">
            <strong>{r.title}</strong>
            <span className="muted">{r.code} · {r.client}</span>
          </span>
          <span className="muted home-when">{meta(r)}</span>
        </li>
      ))}
    </ul>
  );
}

function Ratio({ done, planned }: { done: number; planned: number }) {
  const pct = planned ? Math.round((done / planned) * 100) : 0;
  return (
    <span className="ratio" title={`${pct}%`}>
      <span className="num">{done} / {planned}</span>
      <span className="ratio-track" aria-hidden><span style={{ width: `${Math.min(100, pct)}%` }} /></span>
    </span>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="muted home-empty">{children}</p>;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string, lang: string, o: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang, { ...o, timeZone: 'UTC' });
}
function fmtMonth(ym: string, lang: string) {
  const s = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function ago(iso: string, lang: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
  if (min < 60) return rtf.format(-Math.max(min, 0), 'minute');
  if (min < 48 * 60) return rtf.format(-Math.round(min / 60), 'hour');
  return rtf.format(-Math.round(min / 1440), 'day');
}
