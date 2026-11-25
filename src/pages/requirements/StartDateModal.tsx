// Condiciones del ingreso propias del candidato confirmado:
// - Fecha tentativa de inicio de labores: obligatoria al confirmarlo y corregible mientras IGDT no registre el ingreso.
//   Viaja a IGDT en la solicitud de ingreso (conditions.startDate). Rango del servidor: de hoy - 30 días a hoy + 1 año
//   (fecha UTC, igual que el servidor).
// - Gestor dirigido (opcional): por defecto la solicitud va a los gestores del cliente; se puede dirigir a cualquier
//   gestor de IGDT (igdtManagerId). Si IGDT no responde, solo queda «Gestores del cliente» y no se bloquea nada.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarClock } from 'lucide-react';
import { http } from '../../lib/api';
import { Button, Modal } from '../../components/ui';
import { dayLabel } from '../../lib/documents';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Límites de la fecha tentativa (AAAA-MM-DD). */
function startDateLimits(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const min = new Date(today); min.setUTCDate(min.getUTCDate() - 30);
  const max = new Date(today); max.setUTCFullYear(max.getUTCFullYear() + 1);
  return { today: iso(today), min: iso(min), max: iso(max) };
}

type ManagersView = { available: boolean; managers: { id: string; name: string }[]; clientPrimaryId: string; clientSecondaryId: string };

/** Gestores de IGDT (y los del cliente del RQ); la API los guarda unos minutos. */
const useIgdtManagers = (clientId: string) => useQuery({
  queryKey: ['igdt-managers', clientId], staleTime: 5 * 60_000, retry: false,
  queryFn: () => http.get<ManagersView>(`/api/v1/tenant/igdt/managers?clientId=${encodeURIComponent(clientId)}`),
});

export type HireConditions = { startDate: string; igdtManagerId: string | null };

export function StartDateModal({ mode, name, clientId, initial, initialManager, suggestedManager, busy, onSubmit, onClose }: {
  /** confirm: se está confirmando al candidato; edit: se corrigen las condiciones de un confirmado */
  mode: 'confirm' | 'edit'; name: string; clientId: string; initial?: string | null;
  /** gestor ya dirigido (edición) o sugerido (último dirigido en el mismo RQ, al confirmar) */
  initialManager?: string | null; suggestedManager?: string | null; busy?: boolean;
  onSubmit: (c: HireConditions) => void; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lim = startDateLimits();
  const mq = useIgdtManagers(clientId);
  const [date, setDate] = useState(initial ?? '');
  const [manager, setManager] = useState((mode === 'edit' ? initialManager : suggestedManager) ?? '');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= lim.min && date <= lim.max;
  const range = { min: dayLabel(lim.min, i18n.language), max: dayLabel(lim.max, i18n.language) };
  const view = mq.data?.available ? mq.data : undefined;
  const nameOf = (id: string) => view?.managers.find((m) => m.id === id)?.name;
  const clientMgrs = view ? [view.clientPrimaryId, view.clientSecondaryId].filter((id) => id && nameOf(id)) : [];
  // el gestor ya guardado se conserva aunque IGDT no responda o ya no esté en la lista (para no perderlo al guardar la
  // fecha); una sugerencia que no está en la lista se descarta
  const unknown = mode === 'edit' && manager && manager === initialManager && !nameOf(manager) ? manager : '';
  const selected = manager && (nameOf(manager) || unknown) ? manager : '';
  const submit = () => { if (valid) onSubmit({ startDate: date, igdtManagerId: selected || null }); };
  return (
    <Modal open title={t(mode === 'confirm' ? 'rq.cand.confirmTitle' : 'rq.cand.editStartTitle', { name })} onClose={onClose}
      footer={<><span className="spacer" /><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={submit} loading={busy} disabled={!valid} data-testid="cand-start-save">
          {mode === 'confirm' ? <><BadgeCheck size={15} />{t('rq.cand.confirmAction')}</> : <><CalendarClock size={15} />{t('common.save')}</>}
        </Button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {mode === 'confirm' && <p className="muted" style={{ margin: 0 }}>{t('rq.cand.confirmIntro')}</p>}
        <div className="field">
          <label htmlFor="cand-start">{t('rq.cand.startDate')} *</label>
          <input id="cand-start" className="input" type="date" required min={lim.min} max={lim.max} value={date}
            onChange={(e) => setDate(e.target.value)} aria-describedby="cand-start-hint" aria-invalid={date !== '' && !valid} data-testid="cand-start-date" />
          <span id="cand-start-hint" className="hint">{t('rq.cand.startDateHint', range)}</span>
          {date !== '' && !valid && <span className="error" role="alert">{t('rq.cand.startInvalid', range)}</span>}
        </div>
        <div className="field">
          <label htmlFor="cand-manager">{t('rq.cand.manager')}</label>
          {view && (
            <span className="hint" data-testid="cand-client-managers">
              {clientMgrs.length > 0
                ? t('rq.cand.clientManagers', { names: clientMgrs.map((id) => nameOf(id)).join(', ') })
                : t('rq.cand.clientManagersNone')}
            </span>
          )}
          <select id="cand-manager" className="select" value={selected} onChange={(e) => setManager(e.target.value)}
            disabled={mq.isLoading} aria-describedby="cand-manager-hint" data-testid="cand-manager">
            <option value="">{t('rq.cand.managerDefault')}</option>
            {unknown && <option value={unknown}>{t('rq.cand.managerUnknown')}</option>}
            {clientMgrs.length > 0 && (
              <optgroup label={t('rq.cand.managerClientGroup')}>
                {clientMgrs.map((id) => <option key={`c-${id}`} value={id}>{nameOf(id)} · {t(id === view!.clientPrimaryId ? 'rq.cand.managerPrimary' : 'rq.cand.managerSecondary')}</option>)}
              </optgroup>
            )}
            {view && view.managers.length > 0 && (
              <optgroup label={t('rq.cand.managerAllGroup')}>
                {view.managers.filter((m) => !clientMgrs.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
          </select>
          <span id="cand-manager-hint" className="hint">
            {mq.isLoading ? t('common.loading') : view ? t('rq.cand.managerHint') : t('rq.cand.managerUnavailable')}
          </span>
        </div>
      </form>
    </Modal>
  );
}
