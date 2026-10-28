import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { Button, Card, CopyButton, Field, Modal, SelectField, StatusBadge, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';

interface User { id: string; email: string; fullName: string; status: string; roles: string[]; lastLoginAt?: string; createdAt: string }
interface Invitation { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string }
interface InviteResult { invitation: Invitation; link?: string }

const TENANT_ROLES = ['TENANT_ADMIN', 'SELECTION_LEAD', 'RECRUITER', 'COMMERCIAL', 'VIEWER'];

/** Usuarios e invitaciones. base = '/api/v1/tenant' o '/api/v1/platform' (+ ?tenantId para el SA). */
export function Users({ base = '/api/v1/tenant', query = '', roles = TENANT_ROLES }: { base?: string; query?: string; roles?: string[] }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles[roles.length - 1] === 'VIEWER' ? 'RECRUITER' : roles[0]);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({ queryKey: ['users', base, query], queryFn: () => http.get<{ total: number; items: User[] }>(`${base}/users${query}`) });
  const invites = useQuery({ queryKey: ['invitations', base, query], queryFn: () => http.get<Invitation[]>(`${base}/invitations${query}`) });

  const invite = useMutation({
    mutationFn: () => http.post<InviteResult>(`${base}/invitations${query}`, { email, role, locale: i18n.language }),
    onSuccess: (r) => { setResult(r); toast.success(t('users.inviteSent')); qc.invalidateQueries({ queryKey: ['invitations'] }); },
    onError: (e) => setError(errText(e)),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => http.patch(`${base}/users/${id}/status${query}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error(errText(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => http.del(`${base}/invitations/${id}${query}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
    onError: (e) => toast.error(errText(e)),
  });

  const close = () => { setOpen(false); setEmail(''); setResult(null); setError(null); };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('users.title')}</h1><p className="muted">{t('users.subtitle')}</p></div>
        <Button onClick={() => setOpen(true)}>{t('users.invite')}</Button>
      </div>

      <Card title={t('users.title')}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('common.role')}</th><th>{t('common.status')}</th><th>{t('users.lastLogin')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {users.data?.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}</td><td>{u.email}</td>
                  <td>{u.roles.map((r) => t(`roles.${r}`, r)).join(', ')}</td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{formatDate(u.lastLoginAt, i18n.language)}</td>
                  <td>
                    <Button size="sm" variant="secondary" loading={setStatus.isPending && setStatus.variables?.id === u.id}
                      onClick={() => setStatus.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>
                      {u.status === 'ACTIVE' ? t('users.disable') : t('users.enable')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.isLoading && <Loader />}
          {users.data?.items.length === 0 && <div className="empty">{t('common.empty')}</div>}
        </div>
      </Card>

      <Card title={t('users.invitations')}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.email')}</th><th>{t('common.role')}</th><th>{t('common.status')}</th><th>{t('users.expires')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {invites.data?.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td><td>{t(`roles.${i.role}`, i.role)}</td><td><StatusBadge status={i.status} /></td>
                  <td>{formatDate(i.expiresAt, i18n.language)}</td>
                  <td>{i.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>{t('users.revoke')}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {invites.isLoading && <Loader />}
          {invites.data?.length === 0 && <div className="empty">{t('common.empty')}</div>}
        </div>
      </Card>

      <Modal open={open} onClose={close} title={t('users.inviteTitle')}
        footer={result
          ? <Button onClick={close}>{t('common.close')}</Button>
          : <><Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>
              <Button loading={invite.isPending} disabled={!email} onClick={() => { setError(null); invite.mutate(); }}>{t('common.create')}</Button></>}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {!result && <>
          <Field label={t('common.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <SelectField label={t('common.role')} value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: t(`roles.${r}`, r) }))} />
        </>}
        {result && <div className="stack">
          <div className="alert alert-success">{t('users.inviteSent')}: {result.invitation.email}</div>
          {result.link && <>
            <span className="muted">{t('users.linkLabel')}</span>
            <div className="secret" data-testid="invite-link">{result.link}</div>
            <CopyButton text={result.link} />
          </>}
        </div>}
      </Modal>
    </div>
  );
}
