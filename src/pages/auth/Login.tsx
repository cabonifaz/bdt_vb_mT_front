import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { assetUrl, useTheme } from '../../providers/theme';
import { Button, Field, LangSwitch, PasswordField, useErrorText } from '../../components/ui';
import { OfflineBanner } from '../../components/layout/AppShell';

/** Login de un tenant (/:tenant/login) o de plataforma (/admin/login). */
export function Login({ platform = false }: { platform?: boolean }) {
  const { tenant = '' } = useParams();
  const { t } = useTranslation();
  const { branding, error: brandingError, load } = useTheme();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const errText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!platform && tenant) load(tenant); }, [platform, tenant, load]);

  if (user) return <Navigate to={user.isPlatform ? '/admin' : `/${user.tenantSlug}`} replace />;
  if (!platform && brandingError === 'NOT_FOUND') return <Navigate to="/404" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const me = await login(platform ? null : tenant, email, password);
      nav(me.isPlatform ? '/admin' : `/${me.tenantSlug}`, { replace: true });
    } catch (err) {
      setError(errText(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const name = branding?.displayName ?? t('app.name');
  return (
    <div className="auth">
      <div className="auth-panel">
        <div className="row">
          {!platform && branding
            ? <img className="logo" src={assetUrl(branding.logoUrl)} alt={name} data-testid="tenant-logo" />
            : <strong style={{ fontSize: 20 }}>{t('app.name')}</strong>}
          <span className="spacer" />
          <LangSwitch />
        </div>
        <OfflineBanner />
        <div className="stack" style={{ gap: 6 }}>
          <h1>{platform ? t('login.platformTitle') : t('login.title')}</h1>
          <p className="muted">{platform ? t('login.platformSubtitle') : t('login.subtitle', { tenant: branding?.name ?? tenant })}</p>
        </div>
        <form className="stack" onSubmit={submit} noValidate>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <Field label={t('login.email')} type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <PasswordField label={t('login.password')} autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" block loading={busy} disabled={!email || !password}>{t('login.submit')}</Button>
        </form>
      </div>
      <div className="auth-side" aria-hidden>
        <h2>{t('login.sideTitle')}</h2>
        <p>{t('login.sideText')}</p>
      </div>
    </div>
  );
}
