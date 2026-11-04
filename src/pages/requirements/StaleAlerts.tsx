// Alertas de RQ sin movimiento: cuando pasan varios días sin que ningún postulante del RQ cambie de etapa.
// Nivel 1 (atención) y 2 (crítico) según los días que configura el admin o el jefe de selección (por defecto 5 y 10).
// Aquí: la etiqueta de la tarjeta del tablero, el aviso de la ficha, los días en etapa de cada postulante y la configuración.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Hourglass } from 'lucide-react';
import { http } from '../../lib/api';
import { RQ_API, useRqAlertSettings, type RQAlertSettings, type RQCard } from '../../lib/requirements';
import { Button, Field, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

/** Etiqueta en la tarjeta del tablero: «Sin movimiento · 7 d». */
export function StaleBadge({ stale }: { stale: NonNullable<RQCard['stale']> }) {
  const { t } = useTranslation();
  const tip = t('rq.stale.tip', { days: stale.days }) + ' · ' + t('rq.stale.tipCandidates', { count: stale.candidates });
  return (
    <span className={`rq-stale lvl-${stale.level}`} title={tip} aria-label={tip} data-testid="rq-stale">
      <Hourglass size={12} aria-hidden />{t('rq.stale.badge', { days: stale.days })}
    </span>
  );
}

/** Aviso en la ficha del RQ cuando ningún postulante cambió de etapa en los días de atención. */
export function StaleBanner({ days, warn, crit }: { days: number; warn: number; crit: number }) {
  const { t } = useTranslation();
  if (days < warn) return null;
  const critical = days >= crit;
  return (
    <div className={`alert ${critical ? 'alert-error' : 'alert-warning'} rq-stale-banner`} role="status" data-testid="rq-stale-banner">
      <Hourglass size={16} aria-hidden />
      <span><strong>{t(critical ? 'rq.stale.critical' : 'rq.stale.warning')}</strong> {t('rq.stale.banner', { count: days })}</span>
    </div>
  );
}

/** Días del postulante en su etapa actual (desde los días de atención; rojo desde los críticos). */
export function CandidateIdle({ days, warn, crit }: { days: number; warn: number; crit: number }) {
  const { t } = useTranslation();
  if (days < warn) return null;
  return (
    <span className={`badge ${days >= crit ? 'badge-danger' : 'badge-warning'}`} title={t('rq.stale.candTip', { count: days })} data-testid="cand-idle">
      <Hourglass size={11} aria-hidden />{t('rq.stale.candDays', { count: days })}
    </span>
  );
}

/** Configuración de las alertas (admin y jefe de selección). */
export function StaleSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const q = useRqAlertSettings();
  const [form, setForm] = useState<RQAlertSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data, form]);
  const invalid = !!form && (form.warnDays < 1 || form.warnDays > 90 || form.criticalDays > 180 || form.criticalDays <= form.warnDays);
  const save = async () => {
    if (!form || invalid) return;
    setBusy(true);
    try {
      await http.put(`${RQ_API}/alert-settings`, form);
      toast.success(t('rq.stale.saved'));
      void qc.invalidateQueries({ queryKey: ['rq-alert-settings'] });
      void qc.invalidateQueries({ queryKey: ['rq-board'] });
      void qc.invalidateQueries({ queryKey: ['rq'] });
      onClose();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const num = (v: string) => Math.max(0, Math.min(999, Number.parseInt(v, 10) || 0));
  return (
    <Modal open title={t('rq.stale.settingsTitle')} onClose={onClose}
      footer={<><span className="spacer" /><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={save} disabled={!form || invalid || busy} data-testid="rq-stale-save">{t('common.save')}</Button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{t('rq.stale.settingsHint')}</p>
      {form && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="grid-2">
            <Field label={t('rq.stale.warnDays')} type="number" min={1} max={90} value={form.warnDays}
              onChange={(e) => setForm({ ...form, warnDays: num(e.target.value) })} data-testid="rq-stale-warn" />
            <Field label={t('rq.stale.criticalDays')} type="number" min={2} max={180} value={form.criticalDays}
              onChange={(e) => setForm({ ...form, criticalDays: num(e.target.value) })} data-testid="rq-stale-crit"
              error={invalid ? t('rq.stale.invalid') : undefined} />
          </div>
          <label className="checkbox"><input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} data-testid="rq-stale-notify" />
            {t('rq.stale.notify')}</label>
        </div>
      )}
    </Modal>
  );
}
