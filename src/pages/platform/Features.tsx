// Catálogo de funcionalidades (Super Admin): todas las funcionalidades con su módulo, roles impactados y estado.
// Se suspenden o reactivan para toda la plataforma y se activan o suspenden por empresa; al activarla en una empresa
// se avisa a sus usuarios con los roles impactados. Las de núcleo no se pueden suspender.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Lock, Power } from 'lucide-react';
import { http } from '../../lib/api';
import { Button, Card, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';

type Feature = {
  code: string; name: Record<string, string>; description: Record<string, string>; module: string; roles: string[]; isCore: boolean;
  defaultEnabled: boolean; status: 'ACTIVE' | 'SUSPENDED'; tenantsEnabled: number; tenantsTotal: number; releasedAt: string;
};
type TenantState = { tenantId: string; slug: string; name: string; tenantStatus: string; enabled: boolean; explicit: boolean };

const API = '/api/v1/platform/features';

export function Features() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es';
  const list = useQuery({ queryKey: ['features'], queryFn: () => http.get<Feature[]>(API) });
  const [open, setOpen] = useState<Feature | null>(null);
  const [busy, setBusy] = useState('');
  const toggle = async (f: Feature) => {
    const status = f.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (status === 'SUSPENDED' && !window.confirm(t('features.confirmSuspend', { name: f.name[lang] }))) return;
    setBusy(f.code);
    try {
      await http.patch(`${API}/${f.code}`, { status });
      toast.success(t(status === 'ACTIVE' ? 'features.reactivated' : 'features.suspended', { name: f.name[lang] }));
      void qc.invalidateQueries({ queryKey: ['features'] });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('features.title')}</h1><p className="muted">{t('features.subtitle')}</p></div>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="table" data-testid="features">
            <thead><tr><th>{t('features.feature')}</th><th>{t('features.module')}</th><th>{t('features.roles')}</th><th>{t('features.companies')}</th><th>{t('common.status')}</th><th></th></tr></thead>
            <tbody>
              {(list.data ?? []).map((f) => (
                <tr key={f.code} data-testid="feature-row" className={f.status === 'SUSPENDED' ? 'row-muted' : ''}>
                  <td><strong>{f.name[lang]}</strong>{f.isCore && <span className="badge badge-neutral" style={{ marginLeft: 6 }}><Lock size={11} aria-hidden /> {t('features.core')}</span>}
                    <div className="muted" style={{ fontSize: 12 }}>{f.description[lang]}</div></td>
                  <td>{t(`features.modules.${f.module}`, f.module)}</td>
                  <td style={{ fontSize: 12 }}>{f.roles.map((r) => t(`roles.${r}`, r)).join(', ')}</td>
                  <td>{f.tenantsEnabled}/{f.tenantsTotal}</td>
                  <td><span className={`badge ${f.status === 'ACTIVE' ? 'doc-st-verified' : 'doc-st-rejected'}`} data-testid="feature-status">{t(`features.status.${f.status}`)}</span></td>
                  <td className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="secondary" onClick={() => setOpen(f)} data-testid="feature-tenants"><Building2 size={14} />{t('features.byCompany')}</Button>
                    {!f.isCore && <Button size="sm" variant={f.status === 'ACTIVE' ? 'ghost' : 'primary'} loading={busy === f.code} onClick={() => toggle(f)} data-testid="feature-toggle">
                      <Power size={14} />{t(f.status === 'ACTIVE' ? 'features.suspend' : 'features.reactivate')}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.isLoading && <Loader />}
        </div>
      </Card>
      {open && <TenantsModal f={open} lang={lang} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TenantsModal({ f, lang, onClose }: { f: Feature; lang: 'es' | 'en'; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const list = useQuery({ queryKey: ['features', f.code, 'tenants'], queryFn: () => http.get<TenantState[]>(`${API}/${f.code}/tenants`) });
  const [busy, setBusy] = useState('');
  const set = async (x: TenantState, enabled: boolean) => {
    setBusy(x.tenantId);
    try {
      await http.put(`${API}/${f.code}/tenants/${x.tenantId}`, { enabled });
      toast.success(t(enabled ? 'features.enabledFor' : 'features.suspendedFor', { name: f.name[lang], company: x.name }));
      void qc.invalidateQueries({ queryKey: ['features'] });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  return (
    <Modal open wide title={t('features.byCompanyTitle', { name: f.name[lang] })} onClose={onClose}
      footer={<><span className="spacer" /><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{t('features.byCompanyHint', { roles: f.roles.map((r) => t(`roles.${r}`, r)).join(', ') })}</p>
      {f.status === 'SUSPENDED' && <div className="alert alert-warning" role="status">{t('features.globallySuspended')}</div>}
      <ul className="feature-tenants" data-testid="feature-tenant-list">
        {(list.data ?? []).map((x) => (
          <li key={x.tenantId} data-testid="feature-tenant">
            <span className="grow"><strong>{x.name}</strong> <span className="muted">· {x.slug}{!x.explicit && ` · ${t('features.byDefault')}`}</span></span>
            <span className={`badge ${x.enabled ? 'doc-st-verified' : 'doc-st-missing'}`}>{t(x.enabled ? 'features.on' : 'features.off')}</span>
            {!f.isCore && (
              <Button size="sm" variant={x.enabled ? 'ghost' : 'primary'} loading={busy === x.tenantId} onClick={() => set(x, !x.enabled)} data-testid="feature-tenant-toggle">
                {t(x.enabled ? 'features.suspend' : 'features.activate')}</Button>
            )}
          </li>
        ))}
      </ul>
      {list.isLoading && <Loader />}
    </Modal>
  );
}
