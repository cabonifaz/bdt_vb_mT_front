// Versión junto al logo: número, si es estable (o candidata, en pruebas, retirada) y el ambiente fuera de prod.
// Si mientras la app está abierta se publica otra versión, muestra un aviso para recargar.
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { isProd, useVersion } from '../../lib/version';

export function VersionBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const q = useVersion();
  const v = q.data;
  if (!v?.version) return null;
  const title = [`v${v.version}`, t(`version.status.${v.status}`), !isProd(v.environment) && t(`version.env.${v.environment}`, v.environment)]
    .filter(Boolean).join(' · ');
  return (
    <span className={`version-badge st-${v.status.toLowerCase()}`} title={title} aria-label={t('version.label', { info: title })} data-testid="version-badge">
      <span className="version-num">v{v.version}</span>
      {!compact && <span className="version-st">{t(`version.status.${v.status}`)}</span>}
      {!compact && !isProd(v.environment) && <span className="version-env">{t(`version.env.${v.environment}`, v.environment)}</span>}
    </span>
  );
}

/** Aviso cuando se publica una versión nueva con la app abierta. */
export function NewVersionBanner() {
  const { t } = useTranslation();
  const q = useVersion();
  const first = useRef<string | null>(null);
  const v = q.data?.version;
  if (v && first.current === null) first.current = v;
  if (!v || !first.current || v === first.current) return null;
  return (
    <div className="new-version" role="status" data-testid="new-version">
      <span>{t('version.newAvailable', { version: v })}</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}><RefreshCw size={14} />{t('version.reload')}</button>
    </div>
  );
}
