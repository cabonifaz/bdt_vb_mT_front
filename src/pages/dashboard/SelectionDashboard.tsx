// Indicadores de selección (jefe de selección y administrador): vencidos, ingresos y lo que cuesta cada uno
// (postulantes, entrevistas, horas y días), cierres, analistas (el jefe cuenta como analista), evolución por semanas o
// meses, embudo, postulantes en varios procesos, clientes y perfiles. Período y cliente se eligen arriba.
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { useLabel } from '../../lib/talents';
import { useRqCatalogs } from '../../lib/requirements';
import { periods, presetRange, ratio, useSelectionDashboard, type DashFilters, type Grain, type Preset, type SelectionDashboard as Dash } from '../../lib/dashboard';
import { BarChart } from '../../components/charts/BarChart';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useErrorText } from '../../components/ui';
import { Loader } from '../../components/ui/Loader';

const C1 = 'var(--chart-1)';
const C2 = 'var(--chart-2)';
const PRESETS: Preset[] = ['12W', '3M', '6M', '12M', 'YTD'];

export function SelectionDashboard() {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const errText = useErrorText();
  const cat = useRqCatalogs();
  const [preset, setPreset] = useState<Preset | 'CUSTOM'>('6M');
  const [f, setF] = useState<DashFilters>(() => ({ ...presetRange('6M'), clientId: '' }));
  const q = useSelectionDashboard(f);
  const d = q.data;
  const pickPreset = (p: Preset) => { setPreset(p); setF((x) => ({ ...x, ...presetRange(p) })); };
  const nPeriods = useMemo(() => periods(f.from, f.to, f.grain).length, [f.from, f.to, f.grain]);
  const per = t(`dash.per.${f.grain}`);

  return (
    <div className="page dash-page">
      <div className="page-header">
        <div>
          <h1>{t('dash.title')}</h1>
          <p className="muted">{t('dash.subtitle')}</p>
        </div>
      </div>

      <div className="dash-filters" data-testid="dash-filters">
        <div className="chips" role="group" aria-label={t('dash.period')}>
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`chip chip-toggle${preset === p ? ' on' : ''}`} onClick={() => pickPreset(p)} data-testid={`dash-preset-${p}`}>
              {t(`dash.preset.${p}`)}</button>
          ))}
        </div>
        <label className="dash-date">{t('dash.from')}
          <input className="input" type="date" value={f.from} max={f.to} onChange={(e) => { setPreset('CUSTOM'); setF({ ...f, from: e.target.value }); }} data-testid="dash-from" /></label>
        <label className="dash-date">{t('dash.to')}
          <input className="input" type="date" value={f.to} min={f.from} onChange={(e) => { setPreset('CUSTOM'); setF({ ...f, to: e.target.value }); }} data-testid="dash-to" /></label>
        <div className="chips" role="group" aria-label={t('dash.grainLabel')}>
          {(['WEEK', 'MONTH'] as Grain[]).map((g) => (
            <button key={g} type="button" className={`chip chip-toggle${f.grain === g ? ' on' : ''}`} onClick={() => setF({ ...f, grain: g })} data-testid={`dash-grain-${g}`}>
              {t(`dash.grain.${g}`)}</button>
          ))}
        </div>
        <div className="rq-filter-client">
          <SearchSelect compact value={f.clientId} emptyLabel={t('rq.allClients')} placeholder={t('blacklist.searchClient')} onChange={(id) => setF({ ...f, clientId: id })}
            options={[{ value: '', label: t('rq.allClients') }, ...cat.byTable('CLIENT').map((c) => ({ value: c.id, label: label(c.label) }))]} />
        </div>
      </div>

      {q.isError && <div className="alert alert-error" role="alert">{errText(q.error)}</div>}
      {!d ? <Loader /> : (
        <div className={`dash-body${q.isFetching ? ' is-loading' : ''}`} aria-busy={q.isFetching}>
          <Overview d={d} />
          <Overdue d={d} />
          <Evolution d={d} grain={f.grain} lang={i18n.language} nPeriods={nPeriods} />
          <Analysts d={d} grain={f.grain} nPeriods={nPeriods} per={per} />
          <Funnel d={d} />
          <MultiProcess d={d} />
          <Clients d={d} />
          <Profiles d={d} />
          <Closing d={d} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- piezas

function Section({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="dash-section" data-testid={testId}>
      <h2>{title}{hint && <span className="dash-hint" title={hint} aria-label={hint}><CircleHelp size={14} /></span>}</h2>
      {children}
    </section>
  );
}

function Tile({ title, value, unit, foot, tone, hint, testId }: { title: string; value: ReactNode; unit?: string; foot?: ReactNode; tone?: 'danger' | 'warning' | 'success'; hint?: string; testId?: string }) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ''}`} data-testid={testId} title={hint}>
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value ?? '—'}{unit && value !== null && value !== undefined && <span className="kpi-of">{unit}</span>}</div>
      {foot && <div className="kpi-foot muted">{foot}</div>}
    </div>
  );
}

const fmt = (n: number | null | undefined, lang: string) => (n === null || n === undefined ? null : n.toLocaleString(lang, { maximumFractionDigits: 1 }));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

function Overview({ d }: { d: Dash }) {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const ph = d.perHire;
  return (
    <Section title={t('dash.overview')} testId="dash-overview">
      <div className="kpis">
        <Tile title={t('dash.k.hires')} value={fmt(d.hires.hires, L)} hint={t('dash.h.hires')} testId="dash-k-hires"
          foot={t('dash.k.hiresFoot', { count: ph.rqs })} />
        <Tile title={t('dash.k.candPerHire')} value={fmt(ratio(ph.candidates, ph.hires), L)} hint={t('dash.h.candPerHire')} testId="dash-k-cand-hire"
          foot={t('dash.k.candPerHireFoot', { cands: ph.candidates, hires: ph.hires })} />
        <Tile title={t('dash.k.ivPerHire')} value={fmt(ratio(ph.interviews, ph.hires), L)} hint={t('dash.h.ivPerHire')} testId="dash-k-iv-hire"
          foot={t('dash.k.hoursPerHire', { h: fmt(ratio(ph.interviewMinutes, ph.hires * 60), L) ?? '—' })} />
        <Tile title={t('dash.k.daysToHire')} value={fmt(d.hires.avgDaysToHire, L)} unit={t('dash.days')} hint={t('dash.h.daysToHire')} testId="dash-k-days-hire" />
        <Tile title={t('dash.k.daysToClose')} value={fmt(d.closing.avgDaysToClose, L)} unit={t('dash.days')} hint={t('dash.h.daysToClose')} testId="dash-k-days-close"
          foot={t('dash.k.closedFoot', { count: d.closing.closed })} />
        <Tile title={t('dash.k.candPerSuccess')} value={fmt(d.closing.successAvgCandidates, L)} hint={t('dash.h.candPerSuccess')} testId="dash-k-cand-success"
          foot={t('dash.k.successFoot', { count: d.closing.success })} />
        <Tile title={t('dash.k.onTime')} value={pct(d.closing.onTime, d.closing.closed)} hint={t('dash.h.onTime')}
          tone={d.closing.closed && d.closing.onTime / d.closing.closed < 0.5 ? 'danger' : undefined}
          foot={t('dash.k.onTimeFoot', { onTime: d.closing.onTime, late: d.closing.late })} />
        <Tile title={t('dash.k.fillRate')} value={pct(d.closing.covered, d.closing.vacancies)} hint={t('dash.h.fillRate')}
          foot={t('dash.k.fillRateFoot', { covered: d.closing.covered, total: d.closing.vacancies })} />
        <Tile title={t('dash.k.firstCandidate')} value={fmt(d.speed.avgDaysToFirstCandidate, L)} unit={t('dash.days')} hint={t('dash.h.firstCandidate')}
          foot={t('dash.k.createdFoot', { count: d.speed.created })} />
      </div>
    </Section>
  );
}

function Overdue({ d }: { d: Dash }) {
  const { t } = useTranslation();
  const { tenant = '' } = useParams();
  const o = d.overdue;
  return (
    <Section title={t('dash.overdueTitle')} hint={t('dash.h.overdue')} testId="dash-overdue">
      <div className="kpis">
        <Tile title={t('dash.k.overdueNoCand')} value={o.openNoCandidates} tone={o.openNoCandidates ? 'danger' : undefined} testId="dash-k-overdue-nocand" />
        <Tile title={t('dash.k.overdueWithCand')} value={o.openWithCandidates} tone={o.openWithCandidates ? 'warning' : undefined} testId="dash-k-overdue-cand"
          foot={t('dash.k.overdueNoHire', { count: o.openWithCandidatesNoHire })} />
        <Tile title={t('dash.k.closedLate')} value={d.closing.late} foot={t('dash.k.ofClosed', { count: d.closing.closed })} />
        <Tile title={t('dash.k.staleNow')} value={d.quality.staleNow} tone={d.quality.staleNow ? 'warning' : undefined}
          foot={<Link to={`/${tenant}/requerimientos?vista=sin-movimiento`}>{t('dash.k.seeBoard')}</Link>} />
        <Tile title={t('dash.k.resignations')} value={d.quality.resignations} foot={t('dash.k.resignRate', { pct: pct(d.quality.resignations, d.hires.hires) })} />
        <Tile title={t('dash.k.reopens')} value={d.quality.reopens} foot={t('dash.k.reopensMore', { count: d.quality.reopensMoreVacancies })} />
      </div>
    </Section>
  );
}

function Evolution({ d, grain, lang, nPeriods }: { d: Dash; grain: Grain; lang: string; nPeriods: number }) {
  const { t } = useTranslation();
  // períodos sin datos también se muestran (en 0)
  const rows = useMemo(() => {
    const by = new Map(d.series.map((p) => [p.period, p]));
    return periods(d.from, d.to, grain).map((p) => by.get(p) ?? { period: p, hires: 0, meetings: 0, created: 0, closed: 0 });
  }, [d, grain]);
  const xl = (p: { period: string }) => periodLabel(p.period, grain, lang);
  const sum = (k: 'hires' | 'meetings' | 'created' | 'closed') => rows.reduce((a, r) => a + r[k], 0);
  const avg = (k: 'hires' | 'meetings') => fmtAvg(sum(k), nPeriods, lang);
  return (
    <Section title={t('dash.evolution')} testId="dash-evolution">
      <div className="dash-grid">
        <div className="card dash-card">
          <h3>{t('dash.c.hires')}<span className="muted">{t('dash.avgPer', { avg: avg('hires'), per: t(`dash.per.${grain}`) })}</span></h3>
          <BarChart data={rows} series={[{ key: 'hires', label: t('dash.c.hiresShort'), color: C1 }]} x={(r) => r.period} xLabel={xl}
            value={(r) => r.hires} ariaLabel={t('dash.c.hires')} testId="dash-chart-hires" />
        </div>
        <div className="card dash-card">
          <h3>{t('dash.c.meetings')}<span className="muted">{t('dash.avgPer', { avg: avg('meetings'), per: t(`dash.per.${grain}`) })}</span></h3>
          <BarChart data={rows} series={[{ key: 'meetings', label: t('dash.c.meetingsShort'), color: C1 }]} x={(r) => r.period} xLabel={xl}
            value={(r) => r.meetings} ariaLabel={t('dash.c.meetings')} />
        </div>
        <div className="card dash-card dash-wide">
          <h3>{t('dash.c.rqs')}<span className="muted">{t('dash.c.rqsFoot', { created: sum('created'), closed: sum('closed') })}</span></h3>
          <BarChart data={rows} series={[{ key: 'created', label: t('dash.c.created'), color: C1 }, { key: 'closed', label: t('dash.c.closed'), color: C2 }]}
            x={(r) => r.period} xLabel={xl} value={(r, k) => r[k as 'created' | 'closed']} ariaLabel={t('dash.c.rqs')} />
        </div>
      </div>
    </Section>
  );
}

function Analysts({ d, grain, nPeriods, per }: { d: Dash; grain: Grain; nPeriods: number; per: string }) {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const rows = [...d.analysts].sort((a, b) => b.hires - a.hires || b.meetings - a.meetings);
  const max = Math.max(1, ...rows.map((a) => a.hires));
  const team = rows.length || 1;
  const totHires = rows.reduce((s, a) => s + a.hires, 0);
  const totMeet = rows.reduce((s, a) => s + a.meetings, 0);
  return (
    <Section title={t('dash.analysts')} hint={t('dash.h.analysts')} testId="dash-analysts">
      <p className="muted dash-note">{t('dash.analystsNote', { hires: fmtAvg(totHires, team * nPeriods, L), meetings: fmtAvg(totMeet, team * nPeriods, L), per })}</p>
      <div className="table-wrap">
        <table className="table dash-table">
          <thead>
            <tr>
              <th>{t('dash.t.analyst')}</th><th className="num">{t('dash.t.hires')}</th><th className="num">{t('dash.t.hiresAvg', { per })}</th>
              <th className="num">{t('dash.t.meetings')}</th><th className="num">{t('dash.t.meetingsAvg', { per })}</th><th className="num">{t('dash.t.hours')}</th>
              <th className="num">{t('dash.t.openRqs')}</th><th className="num">{t('dash.t.inProcess')}</th><th className="num">{t('dash.t.overdue')}</th><th className="num">{t('dash.t.stale')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} data-testid="dash-analyst">
                <td>{a.name}{a.lead && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{t('dash.lead')}</span>}</td>
                <td className="num"><span className="dash-inline-bar"><i style={{ width: `${(a.hires / max) * 100}%` }} /></span>{a.hires}</td>
                <td className="num">{fmtAvg(a.hires, nPeriods, L)}</td>
                <td className="num">{a.meetings}</td>
                <td className="num">{fmtAvg(a.meetings, nPeriods, L)}</td>
                <td className="num">{fmt(Math.round((a.meetingMinutes / 60) * 10) / 10, L)}</td>
                <td className="num">{a.openRqs}</td>
                <td className="num">{a.inProcess}</td>
                <td className={`num${a.overdueRqs ? ' text-danger' : ''}`}>{a.overdueRqs}</td>
                <td className={`num${a.staleRqs ? ' text-warning' : ''}`}>{a.staleRqs}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="muted">{t('dash.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted dash-note">{t(`dash.analystsPeriods.${grain}`, { count: nPeriods })}</p>
    </Section>
  );
}

function Funnel({ d }: { d: Dash }) {
  const { t } = useTranslation();
  const f = d.funnel;
  const steps = [
    { key: 'added', n: f.added }, { key: 'dataComplete', n: f.dataComplete }, { key: 'interview', n: f.interview }, { key: 'confirmed', n: f.confirmed },
  ];
  return (
    <Section title={t('dash.funnel')} hint={t('dash.h.funnel')} testId="dash-funnel">
      <div className="dash-funnel">
        {steps.map((s, i) => (
          <div key={s.key} className="dash-funnel-row">
            <span className="dash-funnel-label">{t(`dash.f.${s.key}`)}</span>
            <span className="dash-funnel-bar"><i style={{ width: `${f.added ? (s.n / f.added) * 100 : 0}%` }} /></span>
            <span className="num">{s.n}</span>
            <span className="muted num">{i === 0 ? '100%' : pct(s.n, f.added)}</span>
            <span className="muted num" title={t('dash.f.stepHint')}>{i === 0 ? '' : `↳ ${pct(s.n, steps[i - 1].n)}`}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function MultiProcess({ d }: { d: Dash }) {
  const { t } = useTranslation();
  const { tenant = '' } = useParams();
  const m = d.multiProcess;
  return (
    <Section title={t('dash.multi')} hint={t('dash.h.multi')} testId="dash-multi">
      <div className="kpis">
        <Tile title={t('dash.k.multi')} value={m.multi} foot={t('dash.k.multiFoot', { count: m.talents, pct: pct(m.multi, m.talents) })} testId="dash-k-multi" />
        <Tile title={t('dash.k.multiHired')} value={m.multiHired} foot={t('dash.k.rate', { pct: pct(m.multiHired, m.multi) })} tone="success" testId="dash-k-multi-hired" />
        <Tile title={t('dash.k.singleHired')} value={m.singleHired} foot={t('dash.k.singleFoot', { count: m.single, pct: pct(m.singleHired, m.single) })} />
        <Tile title={t('dash.k.concurrent')} value={m.concurrent} hint={t('dash.h.concurrent')} />
      </div>
      {d.multiTop.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table dash-table">
            <thead><tr><th>{t('dash.t.talent')}</th><th className="num">{t('dash.t.processes')}</th><th className="num">{t('dash.t.active')}</th><th>{t('dash.t.hired')}</th></tr></thead>
            <tbody>
              {d.multiTop.map((x) => (
                <tr key={x.id}>
                  <td><Link to={`/${tenant}/talentos/${x.id}`}>{[x.firstName, x.lastName, x.secondLastName].filter(Boolean).join(' ')}</Link></td>
                  <td className="num">{x.processes}</td><td className="num">{x.active}</td>
                  <td>{x.hired ? <span className="badge badge-success">{t('dash.yes')}</span> : <span className="muted">{t('dash.no')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Clients({ d }: { d: Dash }) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  return (
    <Section title={t('dash.clients')} hint={t('dash.h.clients')} testId="dash-clients">
      <div className="table-wrap">
        <table className="table dash-table">
          <thead><tr><th>{t('dash.t.client')}</th><th className="num">{t('dash.t.rqs')}</th><th className="num">{t('dash.t.open')}</th><th className="num">{t('dash.t.overdue')}</th>
            <th className="num">{t('dash.t.attended')}</th><th className="num">{t('dash.t.lost')}</th><th className="num">{t('dash.t.fill')}</th><th className="num">{t('dash.t.daysClose')}</th></tr></thead>
          <tbody>
            {d.clients.map((c) => (
              <tr key={c.id}>
                <td>{label(c.label)}</td><td className="num">{c.rqs}</td><td className="num">{c.open}</td>
                <td className={`num${c.overdue ? ' text-danger' : ''}`}>{c.overdue}</td><td className="num">{c.attended}</td><td className="num">{c.lostOrCancelled}</td>
                <td className="num">{pct(c.covered, c.vacancies)}</td><td className="num">{fmt(c.avgDaysToClose, i18n.language) ?? '—'}</td>
              </tr>
            ))}
            {d.clients.length === 0 && <tr><td colSpan={8} className="muted">{t('dash.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Profiles({ d }: { d: Dash }) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  return (
    <Section title={t('dash.profiles')} hint={t('dash.h.profiles')} testId="dash-profiles">
      <div className="table-wrap">
        <table className="table dash-table">
          <thead><tr><th>{t('dash.t.profile')}</th><th className="num">{t('dash.t.hires')}</th><th className="num">{t('dash.t.daysHire')}</th><th className="num">{t('dash.t.candHire')}</th></tr></thead>
          <tbody>
            {d.profiles.map((p) => (
              <tr key={p.id}><td>{label(p.label)}</td><td className="num">{p.hires}</td>
                <td className="num">{fmt(p.avgDaysToHire, i18n.language) ?? '—'}</td><td className="num">{fmt(p.candidatesPerHire, i18n.language) ?? '—'}</td></tr>
            ))}
            {d.profiles.length === 0 && <tr><td colSpan={4} className="muted">{t('dash.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Closing({ d }: { d: Dash }) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  return (
    <Section title={t('dash.closing')} hint={t('dash.h.closing')} testId="dash-closing">
      <div className="table-wrap">
        <table className="table dash-table">
          <thead><tr><th>{t('dash.t.reason')}</th><th className="num">{t('dash.t.rqs')}</th><th className="num">{t('dash.t.daysClose')}</th><th className="num">{t('dash.t.candAvg')}</th></tr></thead>
          <tbody>
            {d.closeReasons.map((r) => (
              <tr key={r.code}><td>{label(r.label)}</td><td className="num">{r.count}</td>
                <td className="num">{fmt(r.avgDays, i18n.language) ?? '—'}</td><td className="num">{fmt(r.avgCandidates, i18n.language) ?? '—'}</td></tr>
            ))}
            {d.closeReasons.length === 0 && <tr><td colSpan={4} className="muted">{t('dash.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function fmtAvg(total: number, n: number, lang: string) {
  return n > 0 ? (total / n).toLocaleString(lang, { maximumFractionDigits: 1 }) : '—';
}

/** «sem. 3 nov» o «nov 2026». */
function periodLabel(p: string, grain: Grain, lang: string) {
  const [y, m, d] = p.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return grain === 'WEEK'
    ? date.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
    : date.toLocaleDateString(lang, { month: 'short', year: '2-digit' });
}
