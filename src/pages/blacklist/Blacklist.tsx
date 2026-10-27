import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { fullName, useLabel } from '../../lib/talents';
import { useInterviewCatalogs, type BlacklistTalent } from '../../lib/modules';
import { formatDate, useErrorText } from '../../components/ui';
import { Icon } from '../../components/ui/Icon';
import { Pagination } from '../../components/talents/bits';
import { BlacklistPanel } from '../../components/blacklist/BlacklistPanel';
import { AddRestrictionModal } from '../../components/blacklist/BlacklistModals';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { WsBack } from '../../components/layout/WsBack';

const PAGE = 20;

/** Módulo de lista negra: talentos restringidos (agrupados) y su detalle con historial. */
export function Blacklist() {
  const { tenant = '', id } = useParams();
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const nav = useNavigate();
  const errText = useErrorText();
  const cat = useInterviewCatalogs();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  useEffect(() => { const h = window.setTimeout(() => { setSearch(text); setPage(1); }, 350); return () => window.clearTimeout(h); }, [text]);
  const body = { search, clientId: client === 'ALL' ? '' : client, globalOnly: client === 'ALL', page, pageSize: PAGE };
  const list = useQuery({ queryKey: ['blacklist-list', body], queryFn: () => http.post<{ total: number; items: BlacklistTalent[] }>('/api/v1/tenant/blacklist/search', body), placeholderData: (p) => p });
  const current = list.data?.items.find((x) => x.talentId === id);

  return (
    <div className="ws">
      <aside className="ws-side" aria-label={t('nav.blacklist')}>
        <div className="ws-side-head">
          <h1>{t('nav.blacklist')}</h1>
          {list.data && <span className="muted" data-testid="bl-count">{list.data.total}</span>}
          <span className="spacer" />
        </div>
        {can('blacklist.manage') && <div className="ws-side-action"><button className="btn btn-outline btn-sm btn-block" onClick={() => setAdding(true)} data-testid="bl-new"><Icon name="plus" size={16} />{t('blacklist.add')}</button></div>}
        <div className="ws-side-search stack" style={{ gap: 6 }}>
          <input className="input" type="search" placeholder={t('blacklist.searchTalent')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('common.search')} />
          <SearchSelect compact value={client} onChange={(v) => { setClient(v); setPage(1); }} placeholder={t('blacklist.client')} emptyLabel={t('blacklist.anyClient')}
            options={[{ value: 'ALL', label: t('blacklist.allClients') }, ...cat.byTable('CLIENT').map((c) => ({ value: c.id, label: label(c.label) }))]} />
        </div>
        <nav className="ws-list">
          {list.isError && <div className="alert alert-error">{errText(list.error)}</div>}
          {list.data?.items.map((x) => (
            <Link key={x.talentId} to={`/${tenant}/lista-negra/${x.talentId}`} className={`talent-row${x.talentId === id ? ' active' : ''}`} data-testid="bl-row">
              <span className="bl-ico"><Icon name="ban" size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{fullName(x)}</div>
                <div className="sub">
                  {x.isGlobal ? <span className="badge badge-danger">{t('blacklist.allClients')}</span> : t('blacklist.clientCount', { count: x.clientCount })}
                </div>
                <div className="sub">{formatDate(x.lastChange, i18n.language)}</div>
              </div>
            </Link>
          ))}
          {list.data?.items.length === 0 && <p className="pf-empty" style={{ padding: 8 }}>{t('blacklist.empty')}</p>}
          {list.data && list.data.total > PAGE && <Pagination page={page} total={list.data.total} pageSize={PAGE} onPage={setPage} labels={{ prev: '‹', next: '›', of: t('talents.of') }} />}
        </nav>
      </aside>
      <section className="ws-detail">
        {id && <WsBack to={`/${tenant}/lista-negra`} label={t('nav.blacklist')} />}
        {!id ? (
          <div className="ws-empty"><div className="stack" style={{ alignItems: 'center' }}><Icon name="ban" size={40} /><p>{t('blacklist.selectOne')}</p></div></div>
        ) : (
          <div className="pf">
            <header className="pf-head">
              <div className="pf-id">
                <h1 data-testid="bl-talent-name">{current ? fullName(current) : '…'}</h1>
                <div className="pf-sub">{current?.headline && <span className="pf-headline">{current.headline}</span>}
                  <Link to={`/${tenant}/talentos/${id}`}>{t('blacklist.viewProfile')}</Link></div>
              </div>
            </header>
            <BlacklistPanel talentId={id} talentName={current ? fullName(current) : ''} />
          </div>
        )}
      </section>
      {adding && <AddRestrictionModal onClose={() => setAdding(false)} onDone={(talentId) => { setAdding(false); list.refetch(); nav(`/${tenant}/lista-negra/${talentId}`); }} />}
    </div>
  );
}
