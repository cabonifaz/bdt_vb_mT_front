import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API_URL, http } from '../../lib/api';
import { Button, Card, CopyButton, Field, Modal, StatusBadge, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';

export interface ApiKey {
  id: string; tenantSlug: string; tenantName: string; name: string; prefix: string; scopes: string[];
  status: string; enabledAt?: string; lastUsedAt?: string; createdAt: string; secret?: string;
}

const SCOPES = ['masters.read', 'talent.read', 'talent.write'];

export function ApiKeys() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['masters.read']);
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => http.get<ApiKey[]>('/api/v1/tenant/api-keys') });
  const create = useMutation({
    mutationFn: () => http.post<ApiKey>('/api/v1/tenant/api-keys', { name, scopes }),
    onSuccess: (k) => { setCreated(k); qc.invalidateQueries({ queryKey: ['api-keys'] }); },
    onError: (e) => setError(errText(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => http.post(`/api/v1/tenant/api-keys/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
    onError: (e) => toast.error(errText(e)),
  });
  const close = () => { setOpen(false); setName(''); setCreated(null); setError(null); };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('apiKeys.title')}</h1><p className="muted">{t('apiKeys.subtitle')}</p></div>
        <div className="row">
          <a className="btn btn-secondary" href={`${API_URL}/integration/docs`} target="_blank" rel="noopener noreferrer">{t('apiKeys.docs')}</a>
          <Button onClick={() => setOpen(true)}>{t('apiKeys.request')}</Button>
        </div>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('apiKeys.prefix')}</th><th>{t('apiKeys.scopes')}</th><th>{t('common.status')}</th><th>{t('apiKeys.lastUsed')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {keys.data?.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td><td><code>{k.prefix}</code></td><td>{k.scopes.join(', ')}</td>
                  <td><StatusBadge status={k.status} /></td><td>{formatDate(k.lastUsedAt, i18n.language)}</td>
                  <td>{k.status !== 'REVOKED' && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(k.id)}>{t('apiKeys.revoke')}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.isLoading && <Loader />}
          {keys.data?.length === 0 && <div className="empty">{t('common.empty')}</div>}
        </div>
      </Card>

      <Modal open={open} onClose={close} title={created ? t('apiKeys.secretTitle') : t('apiKeys.request')}
        footer={created ? <Button onClick={close}>{t('common.close')}</Button>
          : <><Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>
              <Button loading={create.isPending} disabled={!name || !scopes.length} onClick={() => { setError(null); create.mutate(); }}>{t('common.create')}</Button></>}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {!created && <>
          <Field label={t('apiKeys.name')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend style={{ fontWeight: 500, marginBottom: 8 }}>{t('apiKeys.scopes')}</legend>
            {SCOPES.map((s) => (
              <label key={s} className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={scopes.includes(s)}
                  onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
                <code>{s}</code>
              </label>
            ))}
          </fieldset>
        </>}
        {created?.secret && <div className="stack">
          <div className="alert alert-info">{t('apiKeys.secretText')}</div>
          <div className="secret" data-testid="api-key-secret">{created.secret}</div>
          <CopyButton text={created.secret} />
          <StatusBadge status={created.status} />
        </div>}
      </Modal>
    </div>
  );
}
