// Reabrir un RQ cerrado (solo el jefe de selección, rq.reopen): renunció un talento o se amplían las vacantes.
// Vuelve a un estado abierto (por defecto En selección) para postular más personas y hacer un nuevo ingreso.
// Por renuncia se marca qué confirmados renunciaron: dejan de cubrir la vacante y su baja queda pendiente (la confirma el FMI).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { http } from '../../lib/api';
import { useLabel, type MasterItem } from '../../lib/talents';
import { RQ_API, fullTalentName, useRequirement, useRqCatalogs } from '../../lib/requirements';
import { Button, Modal, SelectField, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export type ReopenReason = 'RESIGNATION' | 'MORE_VACANCIES';
const REASONS: ReopenReason[] = ['RESIGNATION', 'MORE_VACANCIES'];

export function ReopenModal({ rq, statusId, onClose, onDone }: {
  rq: { id: string; code: string };
  /** estado abierto al que vuelve (p. ej. la columna donde se soltó la tarjeta) */
  statusId?: string;
  onClose: () => void;
  onDone?: (reason: ReopenReason) => void;
}) {
  const { t } = useTranslation();
  const label = useLabel();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const cat = useRqCatalogs();
  const detail = useRequirement(rq.id);
  const open = (cat.byTable('RQ_STATUS') as (MasterItem & { str1?: string })[]).filter((s) => s.str1 !== 'CLOSED');
  // quienes pueden haber renunciado: confirmados que aún no figuran como renunciados
  const confirmed = (detail.data?.candidates ?? []).filter((c) => c.stage.code === 'CONFIRMED' && !c.resignation);
  const profileOf = (vacancyId: string) => label(detail.data?.vacancies.find((v) => v.id === vacancyId)?.profile);
  const [reason, setReason] = useState<ReopenReason | ''>('');
  const [resigned, setResigned] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [target, setTarget] = useState(statusId ?? cat.byCode('RQ_STATUS', 'IN_SELECTION')?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason === 'MORE_VACANCIES' || (reason === 'RESIGNATION' && resigned.length > 0);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await http.post(`${RQ_API}/${rq.id}/reopen`, {
        reason, notes: notes.trim(), statusId: target || undefined, candidates: reason === 'RESIGNATION' ? resigned : [],
      });
      toast.success(t('rq.reopen.done', { code: rq.code }));
      void qc.invalidateQueries({ queryKey: ['rq-board'] });
      void qc.invalidateQueries({ queryKey: ['rq', rq.id] });
      onDone?.(reason as ReopenReason);
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={t('rq.reopen.title', { code: rq.code })} onClose={onClose}
      footer={<><span className="spacer" />
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={submit} loading={busy} disabled={!ready} data-testid="rq-reopen-confirm">{t('rq.reopen.confirm')}</Button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{t('rq.reopen.hint')}</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <fieldset className="reopen-reasons">
        <legend>{t('rq.reopen.reason')}</legend>
        {REASONS.map((r) => {
          // sin confirmados no hay a quién marcar como renunciado
          const off = r === 'RESIGNATION' && !detail.isLoading && confirmed.length === 0;
          return (
            <label key={r} className={`reopen-reason${reason === r ? ' on' : ''}${off ? ' off' : ''}`}>
              <input type="radio" name="reopen-reason" value={r} checked={reason === r} disabled={off} onChange={() => setReason(r)} data-testid={`rq-reopen-${r}`} />
              <span><strong>{t(`rq.reopen.reasons.${r}`)}</strong>
                <span className="muted">{off ? t('rq.reopen.noConfirmed') : t(`rq.reopen.reasonHints.${r}`)}</span></span>
            </label>
          );
        })}
      </fieldset>
      {reason === 'RESIGNATION' && (
        <fieldset className="reopen-resigned" data-testid="rq-reopen-candidates">
          <legend>{t('rq.reopen.whoResigned')}</legend>
          {confirmed.map((c) => (
            <label key={c.id} className="checkbox">
              <input type="checkbox" checked={resigned.includes(c.id)} data-testid="rq-reopen-candidate"
                onChange={(e) => setResigned((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))} />
              <span>{fullTalentName(c.talent)} <span className="muted">· {profileOf(c.vacancyId)}</span></span>
            </label>
          ))}
          <p className="hint">{t('rq.reopen.resignedHint')}</p>
        </fieldset>
      )}
      <SelectField label={t('rq.reopen.status')} value={target} onChange={setTarget}
        options={open.map((s) => ({ value: s.id, label: label(s.label) }))} />
      <div className="field">
        <label htmlFor="rq-reopen-notes">{t('rq.reopen.notes')}</label>
        <textarea id="rq-reopen-notes" className="textarea" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={t('rq.reopen.notesPlaceholder')} />
      </div>
    </Modal>
  );
}
