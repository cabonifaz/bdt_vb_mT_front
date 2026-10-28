import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { useTheme } from '../../providers/theme';
import { Button, Field, LangSwitch, PasswordField, useErrorText } from '../../components/ui';
import i18n from '../../i18n';
import { BrandLogo } from '../../components/ui/BrandLogo';

interface InvitationInfo { email: string; role: string; tenantSlug?: string; tenantName?: string; expiresAt: string }

export function AcceptInvitation() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const { branding, load } = useTheme();
  const errText = useErrorText();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    http.get<InvitationInfo>(`/api/v1/invitations/${encodeURIComponent(token)}`)
      .then((i) => { setInfo(i); if (i.tenantSlug) load(i.tenantSlug); })
      .catch((e) => setLoadError(errText(e)));
  }, [token, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { setError(t('invite.mismatch')); return; }
    setBusy(true);
    setError(null);
    try {
      await http.post(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, { fullName, password: pw, locale: i18n.language });
      setDone(true);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const loginPath = info?.tenantSlug ? `/${info.tenantSlug}/login` : '/admin/login';
  return (
    <div className="auth">
      <div className="auth-panel">
        <div className="row">
          {branding && info?.tenantSlug ? <BrandLogo className="logo" logoUrl={branding.logoUrl} name={branding.displayName} /> : <strong>{t('app.name')}</strong>}
          <span className="spacer" /><LangSwitch />
        </div>
        {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
        {info && !done && (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <h1>{t('invite.title')}</h1>
              <p className="muted">{t('invite.subtitle', { tenant: info.tenantName || t('app.name'), role: t(`roles.${info.role}`, info.role) })}</p>
              <p className="muted">{t('invite.for', { email: info.email })}</p>
            </div>
            <form className="stack" onSubmit={submit}>
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <Field label={t('invite.fullName')} required maxLength={150} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <PasswordField label={t('invite.password')} hint={t('invite.passwordHint')} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <PasswordField label={t('invite.confirm')} required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              <Button type="submit" block loading={busy} disabled={!fullName || !pw || !pw2}>{t('invite.submit')}</Button>
            </form>
          </>
        )}
        {done && (
          <div className="stack">
            <div className="alert alert-success" role="status">{t('invite.done')}</div>
            <Link className="btn btn-primary" to={loginPath}>{t('invite.goLogin')}</Link>
          </div>
        )}
      </div>
      <div className="auth-side" aria-hidden><h2>{t('login.sideTitle')}</h2><p>{t('login.sideText')}</p></div>
    </div>
  );
}
