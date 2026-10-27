import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { setLocale, LOCALES, type Locale } from '../../i18n';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: 'md' | 'sm'; loading?: boolean; block?: boolean;
}
export function Button({ variant = 'primary', size = 'md', loading, block, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}
    >
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Field + Input
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string; hint?: string; error?: string;
}
export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} className="input" aria-invalid={!!error || undefined}
        aria-describedby={hint || error ? `${fid}-d` : undefined} {...rest} />
      {(error || hint) && <span id={`${fid}-d`} className={error ? 'error' : 'hint'}>{error || hint}</span>}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, 'type'>) {
  const [show, setShow] = useState(false);
  const { t } = useTranslation();
  return (
    <div style={{ position: 'relative' }}>
      <Field {...props} type={show ? 'text' : 'password'} style={{ paddingRight: 44 }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow((s) => !s)}
        aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
        style={{ position: 'absolute', right: 4, top: 26 }}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}

export function SelectField({ label, value, onChange, options, id }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <select id={fid} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="color-input">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} (selector)`} />
        <input id={id} className="input" value={value} maxLength={7} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Card / Badge
export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {title && <header className="card-header"><h3>{title}</h3><span className="spacer" />{actions}</header>}
      <div className="card-body">{children}</div>
    </section>
  );
}

const statusTone: Record<string, string> = {
  ACTIVE: 'success', ENABLED: 'success', ACCEPTED: 'success', PENDING: 'warning', INVITED: 'warning',
  SUSPENDED: 'danger', CANCELLED: 'danger', DISABLED: 'neutral', REVOKED: 'danger', EXPIRED: 'neutral', LOCKED: 'danger',
};
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`badge badge-${statusTone[status] ?? 'neutral'}`}>{t(`status.${status}`, status)}</span>;
}

// ---------------------------------------------------------------- Modal (Esc cierra, foco atrapado al abrir)
export function Modal({ title, open, onClose, children, footer, wide, tabs, persistent }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; tabs?: ReactNode;
  /** persistent: no se cierra con Esc ni clic afuera (formularios largos) */
  persistent?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !persistent) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onClose, persistent]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !persistent) onClose(); }}>
      <div className={`modal${wide ? ' modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-header"><h3>{title}</h3></div>
        {tabs}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Errores y otros
export function useErrorText() {
  const { t } = useTranslation();
  return (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'INTERNAL';
    return t(`errors.${code}`, { defaultValue: t('errors.default') });
  };
}

export function LangSwitch() {
  const { i18n, t } = useTranslation();
  return (
    <div className="lang-switch" role="group" aria-label={t('common.language')}>
      {LOCALES.map((l: Locale) => (
        <button key={l} type="button" className={`btn btn-sm ${i18n.language === l ? 'btn-secondary' : 'btn-ghost'}`}
          aria-pressed={i18n.language === l} onClick={() => setLocale(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <Button variant="secondary" size="sm" type="button" onClick={async () => {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    }}>{done ? t('common.copied') : t('common.copy')}</Button>
  );
}

export function formatDate(iso?: string | null, locale = 'es') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
