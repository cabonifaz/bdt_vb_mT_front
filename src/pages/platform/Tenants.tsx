import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { Button, Card, CopyButton, Field, Modal, StatusBadge, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';

interface Tenant { id: string; slug: string; name: string; legalName?: string; taxId?: string; status: string; userCount: number; createdAt: string }
interface Created { tenant: Tenant; adminInvitation?: { invitation: { email: string }; link?: string } }

export function Tenants() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '', legalName: '', taxId: '', adminEmail: '' });
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['tenants', search],
    queryFn: () => http.get<{ total: number; items: Tenant[] }>(`/api/v1/platform/tenants?search=${encodeURIComponent(search)}`),
  });
  const create = useMutation({
    mutationFn: () => http.post<Created>('/api/v1/platform/tenants', {
      slug: form.slug, name: form.name, legalName: form.legalName || null, taxId: form.taxId || null,
      adminEmail: form.adminEmail, defaultLocale: i18n.language, timezone: 'America/Lima',
    }),
    onSuccess: (c) => { setCreated(c); toast.success(t('tenants.created')); qc.invalidateQueries({ queryKey: ['tenants'] }); },
    onError: (e) => setError(errText(e)),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => http.patch(`/api/v1/platform/tenants/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
    onError: (e) => toast.error(errText(e)),
  });
  const close = () => { setOpen(false); setCreated(null); setError(null); setForm({ slug: '', name: '', legalName: '', taxId: '', adminEmail: '' }); };
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('tenants.title')}</h1><p className="muted">{t('tenants.subtitle')}</p></div>
        <div className="row">
          <input className="input" style={{ width: 240 }} placeholder={t('common.search')} aria-label={t('common.search')}
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button onClick={() => setOpen(true)}>{t('tenants.new')}</Button>
        </div>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('tenants.slug')}</th><th>{t('tenants.users')}</th><th>{t('common.status')}</th><th>{t('common.createdAt')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {list.data?.items.map((x) => (
                <tr key={x.id}>
                  <td><strong>{x.name}</strong>{x.legalName && <div className="muted">{x.legalName}</div>}</td>
                  <td><a href={`/${x.slug}/login`}>/{x.slug}</a></td><td>{x.userCount}</td>
                  <td><StatusBadge status={x.status} /></td><td>{formatDate(x.createdAt, i18n.language)}</td>
                  <td className="row" style={{ gap: 4 }}>
                    <Link className="btn btn-ghost btn-sm" to={`/admin/tenants/${x.id}/users`}>{t('nav.users')}</Link>
                    <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: x.id, status: x.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>
                      {x.status === 'ACTIVE' ? t('tenants.suspend') : t('tenants.activate')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.isLoading && <Loader />}
          {list.data?.items.length === 0 && <div className="empty">{t('common.empty')}</div>}
        </div>
      </Card>
      <Modal open={open} onClose={close} title={t('tenants.new')}
        footer={created ? <Button onClick={close}>{t('common.close')}</Button>
          : <><Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>
              <Button loading={create.isPending} disabled={!form.slug || !form.name} onClick={() => { setError(null); create.mutate(); }}>{t('common.create')}</Button></>}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {!created && <>
          <Field label={t('common.name')} value={form.name} onChange={f('name')} />
          <Field label={t('tenants.slug')} hint={t('tenants.slugHint')} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
          <Field label={t('tenants.legalName')} value={form.legalName} onChange={f('legalName')} />
          <Field label={t('tenants.taxId')} value={form.taxId} onChange={f('taxId')} />
          <Field label={t('tenants.adminEmail')} type="email" value={form.adminEmail} onChange={f('adminEmail')} />
        </>}
        {created && <div className="stack">
          <div className="alert alert-success">{t('tenants.created')}: {created.tenant.name}</div>
          <span className="muted">{t('tenants.loginUrl')}</span>
          <div className="secret">{`${location.origin}/${created.tenant.slug}/login`}</div>
          {created.adminInvitation?.link && <>
            <span className="muted">{t('users.linkLabel')}</span>
            <div className="secret">{created.adminInvitation.link}</div>
            <CopyButton text={created.adminInvitation.link} />
          </>}
        </div>}
      </Modal>
    </div>
  );
}
