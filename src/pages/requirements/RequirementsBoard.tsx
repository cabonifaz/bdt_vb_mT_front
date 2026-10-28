// Tablero de requerimientos (Kanban por estado): Registrado → Asignado → En selección → En producción → Cerrados.
// Arrastrar una tarjeta cambia el estado del RQ (rq.write); al soltar en "Cerrados" se elige el motivo de cierre.
// Filtros en memoria (nunca en la URL): texto, cliente y "solo míos".
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Users } from 'lucide-react';
import { http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { useLabel } from '../../lib/talents';
import { RQ_API, daysToDue, dueLevel, useBoard, useRqCatalogs, type BoardFilters, type RQCard } from '../../lib/requirements';
import { Kanban, MoveMenu } from '../../components/kanban/Kanban';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { Button, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { RequirementEditor } from './RequirementEditor';

const CLOSED = 'CLOSED';
type Item = { id: string; table: string; code: string; label: Record<string, string>; sortOrder: number; str1?: string };

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
  const [filters, setFilters] = useState<BoardFilters>({ search: '', clientId: '', mine: false });
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<RQCard | null>(null);
  useEffect(() => { const h = setTimeout(() => setFilters((f) => ({ ...f, search: text })), 300); return () => clearTimeout(h); }, [text]);
  const board = useBoard(filters);
  const canWrite = can('rq.write');

  const statuses = cat.byTable('RQ_STATUS') as Item[];
  const open = statuses.filter((s) => s.str1 !== 'CLOSED');
  const closed = statuses.filter((s) => s.str1 === 'CLOSED');
  const cards = board.data ?? [];
  const columnOf = (c: RQCard) => (c.status.group === 'CLOSED' ? CLOSED : c.status.id);
  const stats = useMemo(() => {
    const openCards = cards.filter((c) => c.status.group !== 'CLOSED');
    return { open: openCards.length, overdue: openCards.filter((c) => dueLevel(c) === 'overdue').length, today: openCards.filter((c) => dueLevel(c) === 'today').length };
  }, [cards]);

  // mover: actualización optimista del tablero y, si el servidor rechaza, se revierte
  const move = async (card: RQCard, statusId: string) => {
    const st = statuses.find((s) => s.id === statusId);
    if (!st) return;
    const key = ['rq-board', filters];
    const prev = qc.getQueryData<RQCard[]>(key);
    qc.setQueryData<RQCard[]>(key, (cur) => cur?.map((c) => (c.id === card.id ? { ...c, status: { id: st.id, code: st.code, label: st.label, group: (st.str1 ?? 'OPEN') as 'OPEN' | 'CLOSED' } } : c)));
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
  const onMove = (card: RQCard, to: string) => (to === CLOSED ? setClosing(card) : void move(card, to));
  const moveOptions = statuses.map((s) => ({ id: s.id, label: label(s.label) }));

  const columns = [
    ...open.map((s) => ({ id: s.id, title: label(s.label), tone: s.code.toLowerCase() })),
    { id: CLOSED, title: t('rq.closedColumn'), tone: 'closed', hint: <span className="muted">{t('rq.closedHint')}</span> },
  ];

  return (
    <div className="page rq-page">
      <div className="page-header">
        <div>
          <h1>{t('rq.title')}</h1>
          <p className="muted" data-testid="rq-stats">
            {t('rq.statsOpen', { count: stats.open })}
            {stats.overdue > 0 && <> · <span className="due-overdue">{t('rq.statsOverdue', { count: stats.overdue })}</span></>}
            {stats.today > 0 && <> · <span className="due-today">{t('rq.statsToday', { count: stats.today })}</span></>}
          </p>
        </div>
        {canWrite && <Button onClick={() => setCreating(true)} data-testid="rq-new"><Plus size={16} />{t('rq.new')}</Button>}
      </div>
      <div className="rq-filters">
        <input className="input" type="search" placeholder={t('rq.searchPlaceholder')} aria-label={t('common.search')} value={text} onChange={(e) => setText(e.target.value)} data-testid="rq-search" />
        <div className="rq-filter-client">
          <SearchSelect compact value={filters.clientId} emptyLabel={t('rq.allClients')} placeholder={t('blacklist.searchClient')}
            onChange={(id) => setFilters((f) => ({ ...f, clientId: id }))}
            options={[{ value: '', label: t('rq.allClients') }, ...cat.byTable('CLIENT').map((c) => ({ value: c.id, label: label(c.label) }))]} />
        </div>
        <label className="checkbox"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters((f) => ({ ...f, mine: e.target.checked }))} data-testid="rq-mine" />{t('rq.mine')}</label>
      </div>
      {board.isLoading || cat.isLoading ? <Loader /> : (
        <Kanban<RQCard> ariaLabel={t('rq.title')} testId="rq-board" columns={columns} items={cards} columnOf={columnOf} onMove={onMove}
          canDrag={canWrite} empty={t('rq.emptyColumn')}
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
                  {canWrite && <MoveMenu label={t('rq.moveTo')} options={moveOptions} current={c.status.id} onPick={(id) => move(c, id)} testId="rq-move" />}
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
