// Tablero de requerimientos (Kanban por estado): Registrado → Asignado → En selección → En producción → Cerrados.
// Arrastrar una tarjeta cambia el estado del RQ (rq.write); al soltar en "Cerrados" se elige el motivo de cierre.
// Vistas: por defecto solo lo abierto y sin vencer; las pestañas llevan a por vencer, vencidos, nuevos, cerrados o todo.
// En la vista Cerrados hay una columna por motivo de cierre.
// Filtros en memoria (nunca en la URL): texto, cliente, contacto del cliente, perfil y "solo míos".
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Users, X } from 'lucide-react';
import { http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { useLabel } from '../../lib/talents';
import {
  BOARD_SCOPES, EMPTY_BOARD_FILTERS, RQ_API, daysToDue, dueLevel, useBoard, useClientContacts, useRqCatalogs,
  type BoardCounts, type BoardData, type BoardFilters, type BoardScope, type RQCard,
} from '../../lib/requirements';
import { Kanban, MoveMenu } from '../../components/kanban/Kanban';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { Button, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { RequirementEditor } from './RequirementEditor';
import { ReopenModal } from './ReopenModal';

const CLOSED = 'CLOSED';
type Item = { id: string; table: string; code: string; label: Record<string, string>; sortOrder: number; str1?: string };
const countKey: Record<BoardScope, keyof BoardCounts> = { ACTIVE: 'active', SOON: 'soon', OVERDUE: 'overdue', NEW: 'new', CLOSED: 'closed', ALL: 'all' };

export function RequirementsBoard() {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const { can } = useAuth();
  const { tenant = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const cat = useRqCatalogs();
  const [text, setText] = useState('');
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_BOARD_FILTERS);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<RQCard | null>(null);
  const [reopening, setReopening] = useState<{ card: RQCard; statusId: string } | null>(null);
  const canReopen = can('rq.reopen');
  useEffect(() => { const h = setTimeout(() => setFilters((f) => ({ ...f, search: text })), 300); return () => clearTimeout(h); }, [text]);
  const board = useBoard(filters);
  const contacts = useClientContacts(filters.clientId);
  const canWrite = can('rq.write');
  const set = (patch: Partial<BoardFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = !!(text || filters.clientId || filters.profileId || filters.mine);
  const clear = () => { setText(''); setFilters((f) => ({ ...EMPTY_BOARD_FILTERS, scope: f.scope })); };

  const statuses = cat.byTable('RQ_STATUS') as Item[];
  const open = statuses.filter((s) => s.str1 !== 'CLOSED');
  const closed = statuses.filter((s) => s.str1 === 'CLOSED');
  const cards = board.data?.cards ?? [];
  const counts = board.data?.counts;
  const closedView = filters.scope === 'CLOSED';
  // en la vista Cerrados cada motivo es una columna; en el resto los cerrados comparten una
  const columnOf = (c: RQCard) => (c.status.group === 'CLOSED' && !closedView ? CLOSED : c.status.id);

  // mover: actualización optimista del tablero y, si el servidor rechaza, se revierte
  const move = async (card: RQCard, statusId: string) => {
    const st = statuses.find((s) => s.id === statusId);
    if (!st) return;
    const key = ['rq-board', filters];
    const prev = qc.getQueryData<BoardData>(key);
    const status = { id: st.id, code: st.code, label: st.label, group: (st.str1 ?? 'OPEN') as 'OPEN' | 'CLOSED' };
    qc.setQueryData<BoardData>(key, (cur) => cur && { ...cur, cards: cur.cards.map((c) => (c.id === card.id ? { ...c, status } : c)) });
    try {
      await http.patch(`${RQ_API}/${card.id}/status`, { statusId });
      toast.success(t('rq.moved', { code: card.code, status: label(st.label) }));
    } catch (e) {
      qc.setQueryData(key, prev);
      toast.error(errText(e));
    } finally {
      void qc.invalidateQueries({ queryKey: ['rq-board'] });
      void qc.invalidateQueries({ queryKey: ['rq', card.id] });
    }
  };
  // soltar en "Cerrados" pide el motivo; dentro de la vista Cerrados se cambia de motivo directamente
  // de cerrado a abierto: solo el jefe de selección, con motivo (ReopenModal); el servidor también lo exige
  const isOpen = (statusId: string) => open.some((s) => s.id === statusId);
  const onMove = (card: RQCard, to: string) => {
    if (to === CLOSED) return setClosing(card);
    if (card.status.group === 'CLOSED' && isOpen(to)) {
      if (canReopen) setReopening({ card, statusId: to });
      else toast.error(t('errors.RQ_REOPEN_REQUIRED'));
      return;
    }
    void move(card, to);
  };
  const moveOptions = (c: RQCard) => statuses
    .filter((s) => c.status.group !== 'CLOSED' || s.str1 === 'CLOSED' || canReopen)
    .map((s) => ({ id: s.id, label: label(s.label) }));

  const columns = closedView
    ? closed.map((s) => ({ id: s.id, title: label(s.label), tone: 'closed' }))
    : [
        ...open.map((s) => ({ id: s.id, title: label(s.label), tone: s.code.toLowerCase() })),
        { id: CLOSED, title: t('rq.closedColumn'), tone: 'closed',
          hint: <span className="muted">{t(filters.scope === 'ALL' ? 'rq.closedHintView' : 'rq.closedHint')}</span> },
      ];

  return (
    <div className="page rq-page">
      <div className="page-header">
        <div>
          <h1>{t('rq.title')}</h1>
          {counts && (
            <p className="muted" data-testid="rq-stats">
              {t('rq.statsOpen', { count: counts.active + counts.overdue })}
              {counts.overdue > 0 && <> · <button type="button" className="link-button rq-stat-overdue" onClick={() => set({ scope: 'OVERDUE' })}>
                {t('rq.statsOverdue', { count: counts.overdue })}</button></>}
            </p>
          )}
        </div>
        {canWrite && <Button onClick={() => setCreating(true)} data-testid="rq-new"><Plus size={16} />{t('rq.new')}</Button>}
      </div>
      <div className="rq-scopes" role="group" aria-label={t('rq.scopeLabel')} data-testid="rq-scopes">
        {BOARD_SCOPES.map((s) => (
          <button key={s} type="button" className={`rq-scope rq-scope-${s.toLowerCase()}${filters.scope === s ? ' active' : ''}`}
            aria-pressed={filters.scope === s} title={t(`rq.scopeHint.${s}`)} onClick={() => set({ scope: s })} data-testid={`rq-scope-${s}`}>
            {t(`rq.scope.${s}`)}
            {counts && <span className="rq-scope-count">{counts[countKey[s]]}</span>}
          </button>
        ))}
      </div>
      <div className="rq-filters">
        <input className="input" type="search" placeholder={t('rq.searchPlaceholder')} aria-label={t('common.search')} value={text} onChange={(e) => setText(e.target.value)} data-testid="rq-search" />
        <div className="rq-filter-client" data-testid="rq-filter-client">
          <SearchSelect compact value={filters.clientId} emptyLabel={t('rq.allClients')} placeholder={t('blacklist.searchClient')}
            onChange={(id) => set({ clientId: id, contactId: '' })}
            options={[{ value: '', label: t('rq.allClients') }, ...cat.byTable('CLIENT').map((c) => ({ value: c.id, label: label(c.label) }))]} />
        </div>
        {filters.clientId && (
          <div className="rq-filter-client" data-testid="rq-filter-contact">
            <SearchSelect compact value={filters.contactId} emptyLabel={t('rq.allContacts')} placeholder={t('rq.searchContact')}
              onChange={(id) => set({ contactId: id })}
              options={[{ value: '', label: t('rq.allContacts') }, ...(contacts.data ?? []).map((c) => ({
                value: c.id, label: [c.firstName, c.lastName, c.secondLastName].filter(Boolean).join(' ') + (c.position ? ` · ${c.position}` : ''),
              }))]} />
          </div>
        )}
        <div className="rq-filter-client" data-testid="rq-filter-profile">
          <SearchSelect compact value={filters.profileId} emptyLabel={t('rq.allProfiles')} placeholder={t('rq.searchProfile')}
            onChange={(id) => set({ profileId: id })}
            options={[{ value: '', label: t('rq.allProfiles') }, ...cat.byTable('RQ_PROFILE').map((p) => ({ value: p.id, label: label(p.label) }))]} />
        </div>
        <label className="checkbox"><input type="checkbox" checked={filters.mine} onChange={(e) => set({ mine: e.target.checked })} data-testid="rq-mine" />{t('rq.mine')}</label>
        {filtered && <Button variant="ghost" size="sm" onClick={clear} data-testid="rq-clear"><X size={14} />{t('rq.clearFilters')}</Button>}
      </div>
      {board.isLoading || cat.isLoading ? <Loader /> : (
        <Kanban<RQCard> ariaLabel={t('rq.title')} testId="rq-board" columns={columns} items={cards} columnOf={columnOf} onMove={onMove}
          canDrag={canWrite} empty={cards.length === 0 ? t('rq.emptyView') : t('rq.emptyColumn')}
          renderCard={(c) => {
            const level = dueLevel(c);
            const days = daysToDue(c.dueDate);
            const pct = c.vacancies ? Math.round((c.covered / c.vacancies) * 100) : 0;
            return (
              <article className={`rq-card${level ? ` due-${level}` : ''}`} data-testid={`rq-card-${c.code}`}>
                <div className="rq-card-top">
                  <span className="rq-code">{c.code}</span>
                  {c.status.group === 'CLOSED' && <span className={`badge rq-st-${c.status.code.toLowerCase()}`}>{label(c.status.label)}</span>}
                  <span className="spacer" />
                  {canWrite && <MoveMenu label={t('rq.moveTo')} options={moveOptions(c)} current={c.status.id} onPick={(id) => onMove(c, id)} testId="rq-move" />}
                </div>
                <Link to={`/${tenant}/requerimientos/${c.id}`} className="rq-title" draggable={false}>{c.title}</Link>
                <div className="rq-client">{label(c.client.label)}</div>
                {(c.profiles ?? []).length > 0 && (
                  <ul className="rq-profiles">{c.profiles!.map((p, i) => <li key={i}><span>{label(p.label)}</span><span className="muted">{p.covered}/{p.total}</span></li>)}</ul>
                )}
                <div className="rq-progress" role="progressbar" aria-valuenow={c.covered} aria-valuemin={0} aria-valuemax={c.vacancies}
                  aria-label={t('rq.coverage', { covered: c.covered, total: c.vacancies })}><span style={{ width: `${pct}%` }} /></div>
                <div className="rq-card-foot">
                  <span className={`rq-due${level ? ` due-${level}` : ''}`} title={new Date(`${c.dueDate}T12:00:00`).toLocaleDateString(i18n.language)}>
                    <CalendarClock size={13} />{c.status.group === 'CLOSED' ? t('rq.dueOn', { date: c.dueDate.slice(5).split('-').reverse().join('/') })
                      : days < 0 ? t('rq.overdueBy', { count: -days }) : days === 0 ? t('rq.dueToday') : t('rq.dueIn', { count: days })}
                  </span>
                  <span className="spacer" />
                  <span className="rq-meta" title={t('rq.candidatesCount', { count: c.candidates })}><Users size={13} />{c.candidates}</span>
                  {c.ownerName && <span className="avatar avatar-xs" title={c.ownerName}>{c.ownerName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>}
                </div>
              </article>
            );
          }} />
      )}
      {creating && <RequirementEditor onClose={() => setCreating(false)} onSaved={(id) => {
        setCreating(false);
        void qc.invalidateQueries({ queryKey: ['rq-board'] });
        nav(`/${tenant}/requerimientos/${id}`);
      }} />}
      {reopening && <ReopenModal rq={reopening.card} statusId={reopening.statusId} onClose={() => setReopening(null)}
        onDone={(reason) => { if (reason === 'MORE_VACANCIES') nav(`/${tenant}/requerimientos/${reopening.card.id}`, { state: { edit: 'vacancies' } }); }} />}
      {closing && (
        <Modal open title={t('rq.closeTitle', { code: closing.code })} onClose={() => setClosing(null)}
          footer={<><span className="spacer" /><Button variant="secondary" onClick={() => setClosing(null)}>{t('common.cancel')}</Button></>}>
          <p className="muted" style={{ marginTop: 0 }}>{t('rq.closeHint')}</p>
          <div className="stack" style={{ gap: 8 }}>
            {closed.map((s) => (
              <Button key={s.id} variant="secondary" onClick={() => { const c = closing; setClosing(null); void move(c, s.id); }} data-testid={`rq-close-${s.code}`}>
                {label(s.label)}
              </Button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
