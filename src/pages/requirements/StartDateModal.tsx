// Fecha tentativa de inicio de labores de un candidato confirmado: obligatoria al confirmarlo en el pipeline y
// corregible mientras IGDT no registre el ingreso. Viaja a IGDT en la solicitud de ingreso (conditions.startDate).
// Rango del servidor: de hoy - 30 días a hoy + 1 año (fecha UTC, igual que el servidor).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, CalendarClock } from 'lucide-react';
import { Button, Modal } from '../../components/ui';
import { dayLabel } from '../../lib/documents';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Límites de la fecha tentativa (AAAA-MM-DD). */
export function startDateLimits(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const min = new Date(today); min.setUTCDate(min.getUTCDate() - 30);
  const max = new Date(today); max.setUTCFullYear(max.getUTCFullYear() + 1);
  return { today: iso(today), min: iso(min), max: iso(max) };
}

export function StartDateModal({ mode, name, initial, busy, onSubmit, onClose }: {
  /** confirm: se está confirmando al candidato; edit: se corrige la fecha de un confirmado */
  mode: 'confirm' | 'edit'; name: string; initial?: string | null; busy?: boolean;
  onSubmit: (date: string) => void; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lim = startDateLimits();
  const [date, setDate] = useState(initial ?? '');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= lim.min && date <= lim.max;
  const range = { min: dayLabel(lim.min, i18n.language), max: dayLabel(lim.max, i18n.language) };
  const submit = () => { if (valid) onSubmit(date); };
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
      </form>
    </Modal>
  );
}
