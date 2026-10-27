import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { fullName, TALENT_API, useLabel, type TalentSummary } from '../../lib/talents';
import { useInterviewCatalogs, type BlacklistEntry } from '../../lib/modules';
import { Button, Modal, useErrorText } from '../ui';

const BL_API = '/api/v1/tenant/blacklist';

function Footer({ onClose, onSave, busy, valid, saveLabel }: { onClose: () => void; onSave: () => void; busy: boolean; valid: boolean; saveLabel: string }) {
  const { t } = useTranslation();
  return <>
    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
    <Button variant="danger" loading={busy} disabled={!valid} onClick={onSave} data-testid="bl-save">{saveLabel}</Button>
  </>;
}

/** Agregar restricción (si no se indica talento, se busca). Cliente vacío = todos los clientes. */
export function AddRestrictionModal({ talentId, talentName, onClose, onDone }: { talentId?: string; talentName?: string; onClose: () => void; onDone: (talentId: string) => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const errText = useErrorText();
  const cat = useInterviewCatalogs();
  const clients = cat.byTable('CLIENT');
  const [talent, setTalent] = useState<{ id: string; name: string } | null>(talentId ? { id: talentId, name: talentName ?? '' } : null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<TalentSummary[]>([]);
  const [client, setClient] = useState<string>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (talent || q.trim().length < 2) { setFound([]); return; }
    const h = window.setTimeout(() => {
      http.post<{ items: TalentSummary[] }>(`${TALENT_API}/search`, { search: q, pageSize: 8 }).then((r) => setFound(r.items)).catch(() => setFound([]));
    }, 400);
    return () => window.clearTimeout(h);
  }, [q, talent]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await http.post(BL_API, { id: crypto.randomUUID(), talentId: talent!.id, clientId: client === 'ALL' ? '' : client, reason: reason.trim() });
      onDone(talent!.id);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={t('blacklist.add')} onClose={onClose} footer={<Footer onClose={onClose} onSave={save} busy={busy} valid={!!talent && !!client && !!reason.trim()} saveLabel={t('blacklist.restrict')} />}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {talent ? (
        <div className="field"><span>{t('blacklist.talent')}</span><strong data-testid="bl-talent">{talent.name}</strong></div>
      ) : (
        <div className="field">
          <label htmlFor="bl-q">{t('blacklist.searchTalent')}</label>
          <input id="bl-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('talents.searchPlaceholder')} autoComplete="off" />
          <div className="item-list">
            {found.map((x) => (
              <button key={x.id} type="button" className="link-btn" style={{ padding: '6px 0' }} onClick={() => setTalent({ id: x.id, name: fullName(x) })}>
                {fullName(x)} <span className="muted">{x.headline ? `· ${x.headline}` : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="bl-client">{t('blacklist.client')}</label>
        <select id="bl-client" className="select" value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">—</option>
          <option value="ALL">{t('blacklist.allClients')}</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{label(c.label)}</option>)}
        </select>
        {client === 'ALL' && <span className="hint">{t('blacklist.globalHint')}</span>}
      </div>
      <div className="field">
        <label htmlFor="bl-reason">{t('blacklist.reason')}</label>
        <textarea id="bl-reason" className="textarea" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Editar motivo o quitar una restricción (con motivo de la baja). */
export function ReasonModal({ entry, mode, onClose, onDone }: { entry: BlacklistEntry; mode: 'edit' | 'remove'; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const errText = useErrorText();
  const [reason, setReason] = useState(mode === 'edit' ? entry.reason : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (mode === 'edit') await http.patch(`${BL_API}/${entry.id}`, { reason: reason.trim() });
      else await http.post(`${BL_API}/${entry.id}/remove`, { reason: reason.trim() });
      onDone();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const client = entry.client ? label(entry.client) : t('blacklist.allClients');
  return (
    <Modal open title={mode === 'edit' ? t('blacklist.editReason') : t('blacklist.remove')} onClose={onClose}
      footer={<Footer onClose={onClose} onSave={save} busy={busy} valid={!!reason.trim()} saveLabel={mode === 'edit' ? t('common.save') : t('blacklist.remove')} />}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <p className="muted">{mode === 'edit' ? client : t('blacklist.removeInfo', { client })}</p>
      <div className="field">
        <label htmlFor="bl-r">{mode === 'edit' ? t('blacklist.reason') : t('blacklist.removeReason')}</label>
        <textarea id="bl-r" className="textarea" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Levantar la restricción global conservando la de los clientes marcados (operación atómica en el servidor). */
export function LiftGlobalModal({ entry, onClose, onDone }: { entry: BlacklistEntry; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const errText = useErrorText();
  const cat = useInterviewCatalogs();
  const clients = cat.byTable('CLIENT');
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [filter, setFilter] = useState('');
  const [reason, setReason] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!initialized && clients.length) { setKeep(Object.fromEntries(clients.map((c) => [c.id, entry.reason]))); setInitialized(true); }
  }, [clients, initialized, entry.reason]);
  const visible = useMemo(() => clients.filter((c) => label(c.label).toLowerCase().includes(filter.toLowerCase())), [clients, filter, label]);
  const kept = Object.entries(keep);
  const valid = !!reason.trim() && kept.every(([, r]) => r.trim());
  const save = async () => {
    if (kept.length === 0 && !confirmAll) { setConfirmAll(true); return; }
    setBusy(true); setError(null);
    try {
      await http.post(`${BL_API}/${entry.id}/lift-global`, { reason: reason.trim(), keep: kept.map(([client, r]) => ({ client, reason: r.trim() })) });
      onDone();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open wide persistent title={t('blacklist.liftGlobal')} onClose={onClose}
      footer={<Footer onClose={onClose} onSave={save} busy={busy} valid={valid}
        saveLabel={kept.length === 0 ? (confirmAll ? t('blacklist.confirmFree') : t('blacklist.freeAll')) : t('blacklist.liftKeeping', { count: kept.length })} />}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <p className="muted">{t('blacklist.liftInfo')}</p>
      <div className="field">
        <label htmlFor="lg-reason">{t('blacklist.liftReason')}</label>
        <textarea id="lg-reason" className="textarea" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="row">
        <input className="input" style={{ flex: 1 }} placeholder={t('blacklist.filterClients')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('blacklist.filterClients')} />
        <Button size="sm" variant="ghost" onClick={() => setKeep(Object.fromEntries(clients.map((c) => [c.id, keep[c.id] ?? entry.reason])))}>{t('blacklist.checkAll')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setKeep({})}>{t('blacklist.uncheckAll')}</Button>
      </div>
      <div className="item-list">
        {visible.map((c) => {
          const on = c.id in keep;
          return (
            <div key={c.id} className="pf-item compact" data-testid="lift-client">
              <label className="checkbox" style={{ minWidth: 200 }}>
                <input type="checkbox" checked={on} onChange={(e) => {
                  const next = { ...keep };
                  if (e.target.checked) next[c.id] = entry.reason; else delete next[c.id];
                  setKeep(next); setConfirmAll(false);
                }} />
                {label(c.label)}
              </label>
              {on && <input className="input" style={{ flex: 1, height: 32 }} value={keep[c.id]} maxLength={1000} aria-label={`${t('blacklist.reason')} ${label(c.label)}`}
                onChange={(e) => setKeep({ ...keep, [c.id]: e.target.value })} />}
            </div>
          );
        })}
      </div>
      {kept.length === 0 && confirmAll && <div className="alert alert-error">{t('blacklist.freeWarning')}</div>}
    </Modal>
  );
}
