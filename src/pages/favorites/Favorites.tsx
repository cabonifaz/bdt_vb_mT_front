import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, http } from '../../lib/api';
import { cachedGet, cachedPost, fullName, TALENT_API, type Collection, type TalentSummary } from '../../lib/talents';
import { Button, Field, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { Stars, TalentPhoto } from '../../components/talents/bits';
import { SearchSelect, type SearchOption } from '../../components/ui/SearchSelect';
import { WsBack } from '../../components/layout/WsBack';

const COLL_API = '/api/v1/tenant/collections';

interface Share { userId: string; name: string; email: string; permission: 'VIEW' | 'EDIT'; createdAt: string }
interface Colleague { id: string; name: string; email: string }

/** Módulo de favoritos: colecciones propias y compartidas conmigo. */
export function Favorites() {
  const { tenant = '', id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const errText = useErrorText();
  const [modal, setModal] = useState<null | 'create' | 'rename' | 'share'>(null);
  const list = useQuery({ queryKey: ['collections'], queryFn: () => cachedGet<Collection[]>(COLL_API) });
  const mine = (list.data ?? []).filter((c) => c.access === 'OWNER');
  const shared = (list.data ?? []).filter((c) => c.access !== 'OWNER');
  const current = list.data?.find((c) => c.id === id);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['collections'] }); qc.invalidateQueries({ queryKey: ['talents'] }); };

  const remove = async () => {
    if (!current) return;
    const msg = current.access === 'OWNER' ? t('favorites.confirmDelete', { name: current.name }) : t('favorites.confirmLeave', { name: current.name });
    if (!window.confirm(msg)) return;
    try {
      await http.del(`${COLL_API}/${current.id}`);
      refresh();
      nav(`/${tenant}/favoritos`);
    } catch (e) { toast.error(errText(e)); }
  };

  const item = (c: Collection) => (
    <Link key={c.id} to={`/${tenant}/favoritos/${c.id}`} className={`talent-row${c.id === id ? ' active' : ''}`} aria-current={c.id === id ? 'true' : undefined} data-testid="collection-row">
      <span className="fav-ico"><Icon name="heart" size={16} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="name">{c.name}</div>
        <div className="sub">
          {t('favorites.count', { count: c.talentCount })}
          {c.access !== 'OWNER' && ` · ${c.ownerName}`}
          {c.access === 'OWNER' && c.shareCount > 0 && ` · ${t('favorites.sharedWith', { count: c.shareCount })}`}
        </div>
      </div>
    </Link>
  );

  return (
    <div className="ws">
      <aside className="ws-side" aria-label={t('nav.favorites')}>
        <div className="ws-side-head">
          <h1>{t('nav.favorites')}</h1>
          <span className="spacer" />
          <button className="btn btn-primary btn-sm icon-btn" onClick={() => setModal('create')} aria-label={t('favorites.new')} title={t('favorites.new')} data-testid="new-collection">
            <Icon name="plus" size={18} />
          </button>
        </div>
        <nav className="ws-list">
          <div className="nav-section" style={{ padding: '4px 8px' }}>{t('favorites.mine')}</div>
          {mine.length === 0 && <p className="pf-empty" style={{ padding: '0 8px' }}>{t('favorites.noneMine')}</p>}
          {mine.map(item)}
          <div className="nav-section" style={{ padding: '12px 8px 4px' }}>{t('favorites.sharedWithMe')}</div>
          {shared.length === 0 && <p className="pf-empty" style={{ padding: '0 8px' }}>{t('favorites.noneShared')}</p>}
          {shared.map(item)}
        </nav>
      </aside>

      <section className="ws-detail">
        {current && <WsBack to={`/${tenant}/favoritos`} label={t('nav.favorites')} />}
        {!current ? (
          <div className="ws-empty"><div className="stack" style={{ alignItems: 'center' }}><Icon name="heart" size={40} /><p>{t('favorites.selectOne')}</p></div></div>
        ) : (
          <div className="pf">
            <header className="pf-head">
              <div className="pf-id">
                <h1 data-testid="collection-name">{current.name}</h1>
                <div className="pf-sub">
                  <span>{t('favorites.count', { count: current.talentCount })}</span>
                  {current.access === 'OWNER'
                    ? <span>{current.shareCount ? t('favorites.sharedWith', { count: current.shareCount }) : t('favorites.private')}</span>
                    : <span>{t('favorites.sharedBy', { name: current.ownerName })} · {t(`favorites.perm.${current.access}`)}</span>}
                </div>
              </div>
              <div className="pf-actions">
                {current.access === 'OWNER' && <>
                  <button className="icon-ghost bordered" onClick={() => setModal('rename')} aria-label={t('favorites.rename')} title={t('favorites.rename')}><Icon name="edit" size={16} /></button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setModal('share')} data-testid="share-collection"><Icon name="users" size={15} />{t('favorites.share')}</button>
                </>}
                <button className="icon-ghost bordered danger" onClick={remove} data-testid="delete-collection"
                  aria-label={current.access === 'OWNER' ? t('favorites.delete') : t('favorites.leave')} title={current.access === 'OWNER' ? t('favorites.delete') : t('favorites.leave')}>
                  <Icon name={current.access === 'OWNER' ? 'trash' : 'x'} size={16} />
                </button>
              </div>
            </header>
            <CollectionTalents tenant={tenant} collection={current} onChanged={refresh} />
          </div>
        )}
      </section>

      {modal === 'create' && <NameModal title={t('favorites.new')} onClose={() => setModal(null)} onSave={async (name) => {
        const newId = crypto.randomUUID();
        await http.post(COLL_API, { id: newId, name });
        refresh();
        nav(`/${tenant}/favoritos/${newId}`);
      }} />}
      {modal === 'rename' && current && <NameModal title={t('favorites.rename')} initial={current.name} onClose={() => setModal(null)} onSave={async (name) => {
        await http.patch(`${COLL_API}/${current.id}`, { name });
        refresh();
      }} />}
      {modal === 'share' && current && <ShareModal collection={current} onClose={() => { setModal(null); refresh(); }} />}
    </div>
  );
}

function CollectionTalents({ tenant, collection, onChanged }: { tenant: string; collection: Collection; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const h = window.setTimeout(() => setSearch(text.trim()), 300); return () => window.clearTimeout(h); }, [text]);
  const body = { collectionId: collection.id, search, page: 1, pageSize: 100 };
  const q = useQuery({ queryKey: ['talents', body], queryFn: () => cachedPost<{ total: number; items: TalentSummary[] }>(`${TALENT_API}/search`, body), placeholderData: (p) => p });
  const canEdit = collection.access !== 'VIEW';
  const removeTalent = async (talentId: string) => {
    try { await http.del(`${COLL_API}/${collection.id}/talents/${talentId}`); onChanged(); q.refetch(); } catch (e) { toast.error(errText(e)); }
  };
  if (q.isLoading) return <p className="muted">{t('common.loading')}</p>;
  return (
    <section className="pf-section">
      <header><h3>{t('nav.talents')}</h3><span className="spacer" />
        {collection.talentCount > 0 && <input className="input input-sm list-search" type="search" placeholder={t('blacklist.searchTalent')} aria-label={t('blacklist.searchTalent')}
          value={text} onChange={(e) => setText(e.target.value)} data-testid="fav-search" />}
      </header>
      {q.data?.items.length === 0 && <p className="pf-empty">{search ? t('common.noResults') : t('favorites.emptyCollection')}</p>}
      <div className="fav-grid">
        {q.data?.items.map((x) => (
          <div key={x.id} className="fav-card" data-testid="favorite-talent">
            <TalentPhoto fileId={x.photoId} name={fullName(x)} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/${tenant}/talentos/${x.id}`} className="pf-item-title fav-link">{fullName(x)}</Link>
              <div className="pf-item-meta">{x.headline || '—'}</div>
              <div className="row" style={{ gap: 6 }}><Stars value={x.avgRating} size={10} /><span className="pf-item-meta">{t('talents.yearsExp', { years: x.yearsExperience })}</span></div>
            </div>
            {canEdit && <button className="icon-ghost danger" onClick={() => removeTalent(x.id)} aria-label={t('favorites.removeTalent')} title={t('favorites.removeTalent')}><Icon name="x" size={15} /></button>}
          </div>
        ))}
      </div>
    </section>
  );
}

function NameModal({ title, initial = '', onClose, onSave }: { title: string; initial?: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const { t } = useTranslation();
  const errText = useErrorText();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open title={title} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={busy} disabled={!name.trim()} onClick={async () => {
        setBusy(true); setError(null);
        try { await onSave(name.trim()); onClose(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
      }}>{t('common.save')}</Button>
    </>}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <Field label={t('talents.collectionName')} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
    </Modal>
  );
}

function ShareModal({ collection, onClose }: { collection: Collection; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const shares = useQuery({ queryKey: ['shares', collection.id], queryFn: () => http.get<Share[]>(`${COLL_API}/${collection.id}/shares`) });
  const [user, setUser] = useState<SearchOption | null>(null);
  const userId = user?.value ?? '';
  // búsqueda en el servidor (mín. 2 caracteres, máx. 10): nunca se descarga el directorio completo
  const sharedIds = shares.data?.map((s) => s.userId).join(',') ?? '';
  const searchUsers = useCallback(async (q: string) => {
    const list = await http.get<Colleague[]>(`/api/v1/tenant/colleagues?q=${encodeURIComponent(q.trim())}`);
    const taken = new Set(sharedIds.split(','));
    return list.filter((c) => !taken.has(c.id)).map((c) => ({ value: c.id, label: c.name, hint: c.email }));
  }, [sharedIds]);
  const [permission, setPermission] = useState<'VIEW' | 'EDIT'>('VIEW');
  const share = async (uid: string, perm: string) => {
    try { await http.put(`${COLL_API}/${collection.id}/shares/${uid}`, { permission: perm }); shares.refetch(); setUser(null); }
    catch (e) { toast.error(e instanceof ApiError ? errText(e) : String(e)); }
  };
  const unshare = async (uid: string) => {
    try { await http.del(`${COLL_API}/${collection.id}/shares/${uid}`); shares.refetch(); } catch (e) { toast.error(errText(e)); }
  };
  return (
    <Modal open title={t('favorites.shareTitle', { name: collection.name })} onClose={onClose} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchSelect id="share-user" label={t('favorites.user')} value={userId} selectedLabel={user?.label} minChars={2}
            onChange={(v, o) => setUser(v && o ? o : null)} load={searchUsers} placeholder={t('favorites.searchUser')} />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label htmlFor="share-perm">{t('favorites.permission')}</label>
          <select id="share-perm" className="select" value={permission} onChange={(e) => setPermission(e.target.value as 'VIEW' | 'EDIT')}>
            <option value="VIEW">{t('favorites.perm.VIEW')}</option>
            <option value="EDIT">{t('favorites.perm.EDIT')}</option>
          </select>
        </div>
        <Button variant="secondary" disabled={!userId} onClick={() => share(userId, permission)} data-testid="add-share">{t('favorites.share')}</Button>
      </div>
      <div className="item-list">
        {shares.data?.length === 0 && <p className="pf-empty">{t('favorites.notShared')}</p>}
        {shares.data?.map((s) => (
          <div key={s.userId} className="pf-item compact" data-testid="share-row">
            <div className="grow"><div className="pf-item-title">{s.name}</div><div className="pf-item-meta">{s.email}</div></div>
            <select className="select" style={{ width: 130, height: 32 }} value={s.permission} onChange={(e) => share(s.userId, e.target.value)} aria-label={t('favorites.permission')}>
              <option value="VIEW">{t('favorites.perm.VIEW')}</option>
              <option value="EDIT">{t('favorites.perm.EDIT')}</option>
            </select>
            <button className="icon-ghost danger" onClick={() => unshare(s.userId)} aria-label={t('favorites.unshare')} title={t('favorites.unshare')}><Icon name="x" size={15} /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
