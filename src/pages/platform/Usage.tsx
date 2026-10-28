// Consumo de servicios externos de pago por tenant (Super Admin): consultas de DNI y tokens de IA (traducción de CV).
// El período y la búsqueda viven en memoria (nunca en la URL).
import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { Card, useErrorText } from '../../components/ui';
import { Icon } from '../../components/ui/Icon';
import { Loader } from '../../components/ui/Loader';

type UsageRow = {
  tenantId: string; slug: string; name: string; month: string; kind: 'DNI_LOOKUP' | 'AI_TRANSLATE'; provider: string;
  calls: number; errors: number; promptTokens: number; completionTokens: number;
};
type Totals = { dni: number; dniErrors: number; ai: number; aiErrors: number; prompt: number; completion: number };
type TenantUsage = Totals & { id: string; name: string; slug: string; rows: UsageRow[] };

const empty = (): Totals => ({ dni: 0, dniErrors: 0, ai: 0, aiErrors: 0, prompt: 0, completion: 0 });
function add(t: Totals, r: UsageRow) {
  if (r.kind === 'DNI_LOOKUP') { t.dni += r.calls; t.dniErrors += r.errors; } else { t.ai += r.calls; t.aiErrors += r.errors; }
  t.prompt += r.promptTokens; t.completion += r.completionTokens;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);
const lastDay = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

export function Usage() {
  const { t, i18n } = useTranslation();
  const errText = useErrorText();
  const [from, setFrom] = useState(thisMonth);
  const [to, setTo] = useState(thisMonth);
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const valid = !!from && !!to && from <= to;
  const q = useQuery({
    queryKey: ['platform-usage', from, to],
    queryFn: () => http.get<UsageRow[]>(`/api/v1/platform/usage?from=${from}-01&to=${lastDay(to)}`),
    enabled: valid,
  });
  const n = (v: number) => v.toLocaleString(i18n.language);

  const { total, tenants } = useMemo(() => {
    const total = empty();
    const by = new Map<string, TenantUsage>();
    for (const r of q.data ?? []) {
      add(total, r);
      const cur = by.get(r.tenantId) ?? { ...empty(), id: r.tenantId, name: r.name, slug: r.slug, rows: [] };
      add(cur, r); cur.rows.push(r);
      by.set(r.tenantId, cur);
    }
    return { total, tenants: [...by.values()].sort((a, b) => (b.prompt + b.completion) - (a.prompt + a.completion) || b.dni - a.dni) };
  }, [q.data]);
  const term = text.trim().toLowerCase();
  const shown = term ? tenants.filter((x) => x.name.toLowerCase().includes(term) || x.slug.includes(term)) : tenants;

  return (
    <div className="page">
      <div className="page-header"><div><h1>{t('usage.title')}</h1><p className="muted">{t('usage.subtitle')}</p></div></div>
      <div className="row usage-filters">
        <div className="field"><label htmlFor="usage-from">{t('usage.from')}</label>
          <input id="usage-from" className="input" type="month" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label htmlFor="usage-to">{t('usage.to')}</label>
          <input id="usage-to" className="input" type="month" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      <div className="kpis" data-testid="usage-kpis">
        <Kpi icon="idcard" title={t('usage.dni')} value={n(total.dni)} sub={total.dniErrors ? t('usage.errors', { count: total.dniErrors }) : undefined} testId="kpi-dni" />
        <Kpi icon="cv" title={t('usage.ai')} value={n(total.ai)} sub={total.aiErrors ? t('usage.errors', { count: total.aiErrors }) : undefined} testId="kpi-ai" />
        <Kpi icon="chart" title={t('usage.tokens')} value={n(total.prompt + total.completion)}
          sub={t('usage.tokensSplit', { prompt: n(total.prompt), completion: n(total.completion) })} testId="kpi-tokens" />
        <Kpi icon="building" title={t('usage.tenants')} value={n(tenants.length)} testId="kpi-tenants" />
      </div>

      <Card title={t('usage.byTenant')} actions={
        <input className="input" type="search" style={{ width: 240, maxWidth: '100%' }} placeholder={t('common.search')} aria-label={t('common.search')}
          value={text} onChange={(e) => setText(e.target.value)} />}>
        <div className="table-wrap">
          <table className="table" data-testid="usage-table">
            <thead><tr>
              <th>{t('usage.tenant')}</th><th className="num">{t('usage.dni')}</th><th className="num">{t('usage.ai')}</th>
              <th className="num">{t('usage.promptTokens')}</th><th className="num">{t('usage.completionTokens')}</th><th className="num">{t('usage.totalTokens')}</th><th aria-label={t('usage.detail')} />
            </tr></thead>
            <tbody>
              {shown.map((x) => (
                <Fragment key={x.id}>
                  <tr data-testid={`usage-${x.slug}`}>
                    <td><strong>{x.name}</strong> <span className="muted">{x.slug}</span></td>
                    <td className="num">{n(x.dni)}{x.dniErrors > 0 && <span className="muted"> ({t('usage.errors', { count: x.dniErrors })})</span>}</td>
                    <td className="num">{n(x.ai)}{x.aiErrors > 0 && <span className="muted"> ({t('usage.errors', { count: x.aiErrors })})</span>}</td>
                    <td className="num">{n(x.prompt)}</td><td className="num">{n(x.completion)}</td><td className="num"><strong>{n(x.prompt + x.completion)}</strong></td>
                    <td><button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}
                      title={t('usage.detail')} aria-label={t('usage.detail')}><Icon name={open === x.id ? 'chevronLeft' : 'chevronRight'} size={15} /></button></td>
                  </tr>
                  {open === x.id && x.rows.map((r) => (
                    <tr key={`${r.month}-${r.kind}-${r.provider}`} className="usage-sub">
                      <td>{monthLabel(r.month, i18n.language)} · {r.kind === 'DNI_LOOKUP' ? t('usage.kindDni') : t('usage.kindAi')} <span className="muted">({r.provider})</span></td>
                      <td className="num">{r.kind === 'DNI_LOOKUP' ? n(r.calls) : ''}</td><td className="num">{r.kind === 'AI_TRANSLATE' ? n(r.calls) : ''}</td>
                      <td className="num">{r.promptTokens ? n(r.promptTokens) : ''}</td><td className="num">{r.completionTokens ? n(r.completionTokens) : ''}</td>
                      <td className="num">{r.promptTokens + r.completionTokens ? n(r.promptTokens + r.completionTokens) : ''}</td><td />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {q.isLoading && <Loader />}
          {!valid && <div className="alert alert-error" role="alert">{t('usage.badRange')}</div>}
          {q.error && <div className="alert alert-error" role="alert">{errText(q.error)}</div>}
          {q.data && shown.length === 0 && <div className="empty">{t('usage.none')}</div>}
        </div>
      </Card>
    </div>
  );
}

function monthLabel(ym: string, lang: string) {
  const s = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Kpi({ icon, title, value, sub, testId }: { icon: string; title: string; value: string; sub?: string; testId: string }) {
  return (
    <div className="kpi" data-testid={testId}>
      <div className="kpi-title"><Icon name={icon} size={15} />{title}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-foot"><span className="muted">{sub}</span></div>}
    </div>
  );
}
