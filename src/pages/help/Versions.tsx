// Versiones publicadas en el ambiente con sus notas. El Super Admin además ve qué versión tiene cada ambiente
// (staging, preprod, prod) y cambia el estado de cada versión (en pruebas, candidata, estable, retirada).
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { GitCommitHorizontal, Server } from 'lucide-react';
import { VERSION_STATUSES, setVersionStatus, useEnvironments, useVersions, type AppVersion, type VersionStatus } from '../../lib/version';
import { Card, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';

const utc = (s?: string) => (!s ? '' : /[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');

function StatusTag({ s }: { s: VersionStatus }) {
  const { t } = useTranslation();
  return <span className={`version-badge st-${s.toLowerCase()}`}><span className="version-st">{t(`version.status.${s}`)}</span></span>;
}

export function Versions({ admin = false }: { admin?: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const list = useVersions();
  const envs = useEnvironments(admin);
  const change = async (v: AppVersion, status: VersionStatus) => {
    try {
      await setVersionStatus(v.version, status);
      toast.success(t('version.statusSaved', { version: v.version, status: t(`version.status.${status}`) }));
      void qc.invalidateQueries({ queryKey: ['app-versions'] });
      void qc.invalidateQueries({ queryKey: ['app-version'] });
    } catch (e) { toast.error(errText(e)); }
  };
  return (
    <div className="page">
      <div className="page-header"><div><h1>{t('version.title')}</h1><p className="muted">{t(admin ? 'version.adminSubtitle' : 'version.subtitle')}</p></div></div>
      {admin && (
        <div className="env-cards" data-testid="version-envs">
          {(envs.data ?? []).sort((a, b) => order(a.environment) - order(b.environment)).map((e) => (
            <Card key={e.environment}>
              <div className="env-card">
                <div className="row" style={{ gap: 6 }}><Server size={16} aria-hidden /><strong>{t(`version.env.${e.environment}`, e.environment)}</strong>
                  {e.current && <span className="muted">· {t('version.thisEnv')}</span>}</div>
                {e.error || !e.version ? <div className="muted">{t('version.unavailable')}</div> : <>
                  <div className="env-version">v{e.version}</div>
                  <StatusTag s={e.status} />
                  {e.commit && <div className="muted mono"><GitCommitHorizontal size={12} aria-hidden /> {e.commit.slice(0, 7)}</div>}
                </>}
              </div>
            </Card>
          ))}
          {envs.isLoading && <Loader />}
        </div>
      )}
      <div className="release-list" data-testid="version-list">
        {(list.data ?? []).map((v, i) => (
          <Card key={v.version}>
            <div className="release-item" data-testid="version-item">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>v{v.version}</h3>
                <StatusTag s={v.status} />
                {i === 0 && <span className="badge badge-neutral">{t('version.current')}</span>}
                <span className="spacer" />
                <span className="muted" style={{ fontSize: 12 }}>{v.publishedAt && formatDate(utc(v.publishedAt), i18n.language)}{v.commit && ` · ${v.commit.slice(0, 7)}`}</span>
              </div>
              <ul className="version-notes">{v.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>
              {admin && (
                <label className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>
                  {t('version.setStatus')}
                  <select className="select" style={{ width: 'auto' }} value={v.status} onChange={(e) => void change(v, e.target.value as VersionStatus)} data-testid="version-status">
                    {VERSION_STATUSES.map((s) => <option key={s} value={s}>{t(`version.status.${s}`)}</option>)}
                  </select>
                </label>
              )}
            </div>
          </Card>
        ))}
        {list.isLoading && <Loader />}
        {list.data?.length === 0 && <div className="empty">{t('version.empty')}</div>}
      </div>
    </div>
  );
}

const order = (env: string) => ({ local: 0, staging: 1, preprod: 2, production: 3, prod: 3 }[env] ?? 9);
