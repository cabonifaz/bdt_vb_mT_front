import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { LangSwitch } from '../ui';

/** Avatar con la inicial; al hacer clic muestra nombre, rol, idioma y cerrar sesión. */
export function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (user?.fullName ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button className="avatar avatar-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={t('nav.userMenu')} data-testid="user-menu">{initials}</button>
      {open && (
        <div className="user-pop" role="menu">
          <div className="stack" style={{ gap: 2 }}>
            <strong>{user?.fullName}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{user?.email}</span>
            <span className="muted" style={{ fontSize: 12 }}>{user?.roles.map((r) => t(`roles.${r}`, r)).join(', ')}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12 }}>{t('common.language')}</span>
            <LangSwitch />
          </div>
          <button className="btn btn-secondary btn-sm btn-block" role="menuitem" onClick={() => { setOpen(false); onLogout(); }}><Icon name="logout" size={15} />{t('common.logout')}</button>
        </div>
      )}
    </div>
  );
}
