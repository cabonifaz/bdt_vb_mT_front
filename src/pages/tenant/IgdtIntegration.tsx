// Administración › Integración IGDT: el admin conecta la empresa con IGDT pegando el token de integración que le
// entrega IGDT (alcances masters.read y catalog.import). Al conectar se envían a IGDT los catálogos que BDT ya tenía y
// desde ahí clientes, contactos, perfiles, tarifario, modalidades, monedas, plazos, áreas y motivos se administran
// solo en IGDT; BDT los sincroniza cada pocos minutos o al pulsar «Sincronizar ahora».
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Link2, RefreshCw, Unplug } from 'lucide-react';
import { IGDT_KEY, connectIgdt, disconnectIgdt, syncIgdt, useIgdtStatus } from '../../lib/igdt';
import { useLabel } from '../../lib/talents';
import { utcISO } from '../../lib/documents';
import { Button, Card, PasswordField, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { useAuth } from '../../providers/auth';

export function IgdtIntegration() {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const { reload } = useAuth();
  const q = useIgdtStatus();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'' | 'connect' | 'sync' | 'disconnect'>('');
  const s = q.data;
  const when = (v?: string | null) => (v ? new Date(utcISO(v)).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: IGDT_KEY });
    void reload().catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['masters'] });
    void qc.invalidateQueries({ queryKey: ['clients-admin'] });
  };
  const run = async (what: 'connect' | 'sync' | 'disconnect') => {
    if (what === 'disconnect' && !window.confirm(t('igdt.confirmDisconnect'))) return;
    setBusy(what);
    try {
      if (what === 'connect') { await connectIgdt(key.trim()); setKey(''); toast.success(t('igdt.connected')); }
      if (what === 'sync') { await syncIgdt(); toast.success(t('igdt.synced')); }
      if (what === 'disconnect') { await disconnectIgdt(); toast.success(t('igdt.disconnected')); }
      refresh();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  if (q.isLoading) return <Loader />;
  if (q.isError || !s) return <div className="page"><div className="alert alert-error" role="alert">{errText(q.error)}</div></div>;
  return (
    <div className="page igdt-page">
      <div className="page-header"><div><h1>{t('igdt.title')}</h1><p className="muted">{t('igdt.subtitle')}</p></div></div>
      {!s.available && <div className="alert alert-warning" role="status">{t('igdt.unavailable')}</div>}
      <div className="igdt-grid">
        <Card>
          <div className="igdt-state" data-testid="igdt-state">
            {s.connected ? <CheckCircle2 size={22} className="igdt-ok" aria-hidden /> : <Unplug size={22} className="muted" aria-hidden />}
            <div>
              <strong>{t(s.connected ? 'igdt.stateOn' : 'igdt.stateOff')}</strong>
              <p className="muted" style={{ margin: '2px 0 0' }}>{t(s.connected ? 'igdt.stateOnHint' : 'igdt.stateOffHint')}</p>
            </div>
          </div>
          {s.connected ? (
            <>
              <dl className="igdt-facts">
                <dt>{t('igdt.remoteTenant')}</dt><dd>{s.remoteTenant}</dd>
                <dt>{t('igdt.importedAt')}</dt><dd>{when(s.importedAt)}</dd>
                <dt>{t('igdt.lastSync')}</dt><dd data-testid="igdt-last-sync">{when(s.lastSyncAt)}</dd>
                <dt>{t('igdt.copy')}</dt><dd>{t('igdt.copyCounts', s.counts)}</dd>
              </dl>
              {s.lastError && <div className="alert alert-error" role="alert">{t('igdt.lastError', { error: t(`errors.${s.lastError}`, s.lastError) })}</div>}
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={() => run('sync')} loading={busy === 'sync'} disabled={!!busy} data-testid="igdt-sync"><RefreshCw size={16} />{t('igdt.syncNow')}</Button>
                <Button variant="secondary" onClick={() => run('disconnect')} loading={busy === 'disconnect'} disabled={!!busy} data-testid="igdt-disconnect">
                  <Unplug size={16} />{t('igdt.disconnect')}</Button>
              </div>
            </>
          ) : (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('connect'); }}>
              <PasswordField label={t('igdt.token')} hint={t('igdt.tokenHint')} autoComplete="off" spellCheck={false} maxLength={200}
                value={key} onChange={(e) => setKey(e.target.value)} data-testid="igdt-token" />
              <div><Button type="submit" loading={busy === 'connect'} disabled={!key.trim() || !s.available || !!busy} data-testid="igdt-connect">
                <Link2 size={16} />{t('igdt.connect')}</Button></div>
            </form>
          )}
        </Card>
        <Card>
          <h2 className="igdt-h2">{t('igdt.whatTitle')}</h2>
          <p className="muted">{t('igdt.whatHint')}</p>
          <ul className="igdt-tables">{(s.tables ?? []).map((x) => <li key={x.code}>{label(x.label)}</li>)}<li>{t('igdt.contactsAndTariffs')}</li></ul>
          <h2 className="igdt-h2">{t('igdt.howTitle')}</h2>
          <ol className="igdt-steps">
            <li>{t('igdt.step1')}</li><li>{t('igdt.step2')}</li><li>{t('igdt.step3')}</li><li>{t('igdt.step4')}</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

/** Aviso en las pantallas de catálogos gobernados por IGDT. */
export function ManagedByIgdt() {
  const { t } = useTranslation();
  return <div className="alert alert-info igdt-banner" role="status" data-testid="managed-by-igdt"><Link2 size={16} aria-hidden />{t('igdt.managedBanner')}</div>;
}
