import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { useLabel } from '../../lib/talents';
import type { BlacklistEntry, BlacklistMovement } from '../../lib/modules';
import { formatDate } from '../ui';
import { Icon } from '../ui/Icon';
import { AddRestrictionModal, LiftGlobalModal, ReasonModal } from './BlacklistModals';

/** Restricciones activas + historial de un talento, con acciones (todas en modal). */
export function BlacklistPanel({ talentId, talentName }: { talentId: string; talentName: string }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const qc = useQueryClient();
  const canManage = can('blacklist.manage');
  const [modal, setModal] = useState<null | { kind: 'add' } | { kind: 'edit' | 'remove' | 'lift'; entry: BlacklistEntry }>(null);
  const [showHistory, setShowHistory] = useState(false);
  const status = useQuery({ queryKey: ['blacklist', talentId], queryFn: () => http.get<BlacklistEntry[]>(`/api/v1/tenant/talents/${talentId}/blacklist`) });
  const history = useQuery({
    queryKey: ['blacklist-history', talentId], enabled: showHistory,
    queryFn: () => http.get<{ total: number; items: BlacklistMovement[] }>(`/api/v1/tenant/talents/${talentId}/blacklist/history?pageSize=100`),
  });
  const refresh = () => {
    setModal(null);
    qc.invalidateQueries({ queryKey: ['blacklist', talentId] });
    qc.invalidateQueries({ queryKey: ['blacklist-history', talentId] });
    qc.invalidateQueries({ queryKey: ['blacklist-list'] });
    qc.invalidateQueries({ queryKey: ['talents'] });
  };
  const entries = status.data ?? [];
  const global = entries.find((e) => !e.clientId);
  const perClient = entries.filter((e) => e.clientId);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="pf-section">
        <header>
          <h3>{t('blacklist.active')}</h3>
          {canManage && !global && <button className="btn btn-outline btn-sm" onClick={() => setModal({ kind: 'add' })} data-testid="bl-add"><Icon name="plus" size={15} />{t('blacklist.addRestriction')}</button>}
        </header>
        {entries.length === 0 && <p className="pf-empty" data-testid="bl-none">{t('blacklist.none')}</p>}
        {global && (
          <div className="bl-global" data-testid="bl-global">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong><Icon name="ban" size={15} /> {t('blacklist.globalTitle')}</strong>
              {canManage && <div className="row" style={{ gap: 2 }}>
                <button className="icon-ghost" onClick={() => setModal({ kind: 'edit', entry: global })} aria-label={t('blacklist.editReason')} title={t('blacklist.editReason')}><Icon name="edit" size={15} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'lift', entry: global })} data-testid="bl-lift">{t('blacklist.liftGlobal')}</button>
              </div>}
            </div>
            <p className="pf-text">{global.reason}</p>
            <div className="pf-item-meta">{global.userName} · {formatDate(global.changedAt, i18n.language)}</div>
          </div>
        )}
        {perClient.map((e) => (
          <div key={e.id} className="pf-item" data-testid="bl-client">
            <div className="grow">
              <div className="pf-item-title">{label(e.client)}</div>
              <p className="pf-text">{e.reason}</p>
              <div className="pf-item-meta">{e.userName} · {formatDate(e.changedAt, i18n.language)}</div>
            </div>
            {canManage && <div className="pf-row-actions" style={{ opacity: 1 }}>
              <button className="icon-ghost" onClick={() => setModal({ kind: 'edit', entry: e })} aria-label={t('blacklist.editReason')} title={t('blacklist.editReason')}><Icon name="edit" size={15} /></button>
              <button className="icon-ghost danger" onClick={() => setModal({ kind: 'remove', entry: e })} aria-label={t('blacklist.remove')} title={t('blacklist.remove')}><Icon name="trash" size={15} /></button>
            </div>}
          </div>
        ))}
      </section>

      <section className="pf-section">
        <header>
          <button className="link-btn" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} data-testid="bl-history-toggle">
            <h3 style={{ display: 'inline' }}>{t('blacklist.history')} {showHistory ? '▾' : '▸'}</h3>
          </button>
        </header>
        {showHistory && (
          <ol className="timeline">
            {history.data?.items.length === 0 && <p className="pf-empty">{t('blacklist.noHistory')}</p>}
            {history.data?.items.map((h) => (
              <li key={h.id} className={`tl-${h.movement.toLowerCase()}`} data-testid="bl-movement">
                <div className="row" style={{ gap: 8 }}>
                  <span className={`badge badge-${h.movement === 'CREATE' ? 'danger' : h.movement === 'DELETE' ? 'success' : 'warning'}`}>{t(`blacklist.movement.${h.movement}`)}</span>
                  <span className="pf-item-meta">{formatDate(h.createdAt, i18n.language)} · {h.userName}</span>
                </div>
                <div className="pf-text"><strong>{h.client ? label(h.client) : t('blacklist.allClients')}</strong> — {h.reason}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {modal?.kind === 'add' && <AddRestrictionModal talentId={talentId} talentName={talentName} onClose={() => setModal(null)} onDone={refresh} />}
      {(modal?.kind === 'edit' || modal?.kind === 'remove') && <ReasonModal entry={modal.entry} mode={modal.kind} onClose={() => setModal(null)} onDone={refresh} />}
      {modal?.kind === 'lift' && <LiftGlobalModal entry={modal.entry} onClose={() => setModal(null)} onDone={refresh} />}
    </div>
  );
}
