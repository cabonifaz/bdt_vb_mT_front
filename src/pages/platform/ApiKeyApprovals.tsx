import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { Button, Card, StatusBadge, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { ApiKey } from '../tenant/ApiKeys';

export function ApiKeyApprovals() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const keys = useQuery({ queryKey: ['platform-api-keys'], queryFn: () => http.get<ApiKey[]>('/api/v1/platform/api-keys') });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => http.patch(`/api/v1/platform/api-keys/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-api-keys'] }),
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <div className="page">
      <div className="page-header"><div><h1>{t('nav.approvals')}</h1><p className="muted">{t('apiKeys.subtitle')}</p></div></div>
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('apiKeys.tenant')}</th><th>{t('common.name')}</th><th>{t('apiKeys.prefix')}</th><th>{t('apiKeys.scopes')}</th><th>{t('common.status')}</th><th>{t('common.createdAt')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {keys.data?.map((k) => (
                <tr key={k.id} data-testid={`key-${k.prefix}`}>
                  <td>{k.tenantName}</td><td>{k.name}</td><td><code>{k.prefix}</code></td><td>{k.scopes.join(', ')}</td>
                  <td><StatusBadge status={k.status} /></td><td>{formatDate(k.createdAt, i18n.language)}</td>
                  <td className="row" style={{ gap: 4 }}>
                    {(k.status === 'PENDING' || k.status === 'DISABLED') &&
                      <Button size="sm" onClick={() => setStatus.mutate({ id: k.id, status: 'ENABLED' })}>{t('apiKeys.approve')}</Button>}
                    {k.status === 'ENABLED' &&
                      <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: k.id, status: 'DISABLED' })}>{t('apiKeys.disable')}</Button>}
                    {k.status !== 'REVOKED' &&
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: k.id, status: 'REVOKED' })}>{t('apiKeys.revoke')}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.data?.length === 0 && <div className="empty">{t('common.empty')}</div>}
        </div>
      </Card>
    </div>
  );
}
