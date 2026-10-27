import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { cachedGet, useLabel } from '../../lib/talents';
import type { ClientItem } from '../../lib/modules';
import { Button, Card, Field, Modal, StatusBadge, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';

/** Catálogo de clientes del tenant (se usa en lista negra y entrevistas). */
export function Clients() {
  const { t } = useTranslation();
  const label = useLabel();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ClientItem | null | 'new'>(null);
  const list = useQuery({ queryKey: ['clients-admin'], queryFn: () => cachedGet<ClientItem[]>('/api/v1/masters/items?tables=CLIENT&includeInactive=true') });
  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('clients.title')}</h1><p className="muted">{t('clients.subtitle')}</p></div>
        <Button onClick={() => setEditing('new')} data-testid="new-client"><Icon name="plus" size={16} />{t('clients.new')}</Button>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('clients.name')}</th><th>{t('clients.taxId')}</th><th>{t('clients.address')}</th><th>{t('common.status')}</th><th></th></tr></thead>
            <tbody>
              {list.data?.map((c) => (
                <tr key={c.id} data-testid="client-row">
                  <td><strong>{label(c.label)}</strong></td><td>{c.str1 || '—'}</td><td>{c.str2 || '—'}</td>
                  <td><StatusBadge status={c.isActive ? 'ACTIVE' : 'DISABLED'} /></td>
                  <td><button className="icon-ghost" onClick={() => setEditing(c)} aria-label={t('talents.edit')}><Icon name="edit" size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.length === 0 && <div className="empty">{t('clients.empty')}</div>}
        </div>
      </Card>
      {editing && <ClientModal client={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['clients-admin'] }); qc.invalidateQueries({ queryKey: ['masters'] }); }} />}
    </div>
  );
}

function ClientModal({ client, onClose, onSaved }: { client: ClientItem | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [v, setV] = useState({ name: client?.label.es ?? '', taxId: client?.str1 ?? '', address: client?.str2 ?? '', mapsUrl: client?.str3 ?? '', active: client?.isActive ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const code = client?.code ?? `CLI-${(v.taxId || v.name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await http.put('/api/v1/tenant/masters/items', {
        table: 'CLIENT', id: client?.id ?? crypto.randomUUID(), code, label: { es: v.name.trim(), en: v.name.trim() },
        str1: v.taxId.trim() || null, str2: v.address.trim() || null, str3: v.mapsUrl.trim() || null, isActive: v.active,
      });
      toast.success(t('clients.saved'));
      onSaved();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={client ? t('clients.edit') : t('clients.new')} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={busy} disabled={!v.name.trim()} onClick={save}>{t('common.save')}</Button>
    </>}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <Field label={t('clients.name')} maxLength={200} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Field label={t('clients.taxId')} maxLength={20} value={v.taxId} onChange={(e) => setV({ ...v, taxId: e.target.value })} />
      <Field label={t('clients.address')} maxLength={250} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
      <Field label={t('clients.mapsUrl')} type="url" placeholder="https://maps.app.goo.gl/..." maxLength={250} value={v.mapsUrl} onChange={(e) => setV({ ...v, mapsUrl: e.target.value })} />
      <label className="checkbox"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />{t('clients.active')}</label>
    </Modal>
  );
}
