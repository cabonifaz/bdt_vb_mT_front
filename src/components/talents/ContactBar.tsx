import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import type { Rates } from '../../lib/talents';

export interface ContactItem {
  key: string;
  icon: string;
  label: string;
  value?: string;
  /** acción principal (mailto:, tel:, https://…) */
  href?: string;
  actionLabel?: string;
}

/**
 * Datos de contacto como íconos: el valor solo se muestra al hacer clic (globo con copiar/abrir).
 * Los íconos sin dato se ven atenuados y no se pueden abrir.
 */
export function ContactBar({ items }: { items: ContactItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="contact-bar" ref={ref} role="group" aria-label={t('talents.contact')}>
      {items.map((it) => {
        const has = !!it.value;
        const isOpen = open === it.key;
        return (
          <div key={it.key} className="contact-item">
            <button type="button" className={`contact-icon${has ? '' : ' is-empty'}${isOpen ? ' active' : ''}`} disabled={!has}
              aria-label={has ? it.label : `${it.label}: ${t('talents.noData')}`} title={it.label} aria-expanded={has ? isOpen : undefined}
              onClick={() => { setCopied(false); setOpen(isOpen ? null : it.key); }} data-testid={`contact-${it.key}`}>
              <Icon name={it.icon} size={18} />
            </button>
            {isOpen && has && (
              <div className="contact-pop" role="dialog" aria-label={it.label} data-testid={`contact-pop-${it.key}`}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{it.label}</span>
                <span className="contact-value">{it.value}</span>
                <div className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(it.value!); setCopied(true); }}>
                    <Icon name="copy" size={14} />{copied ? t('common.copied') : t('common.copy')}
                  </button>
                  {it.href && (
                    <a className="btn btn-ghost btn-sm" href={it.href} target={it.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
                      <Icon name="external" size={14} />{it.actionLabel}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Expectativa salarial en una sola línea; solo lo que tiene dato. */
export function RatesLine({ rates, modality, payrollCurrency, rxhCurrency }: {
  rates?: Rates; modality?: string; payrollCurrency?: string; rxhCurrency?: string;
}) {
  const { t } = useTranslation();
  const range = (min?: number, max?: number, cur?: string) => {
    if (min === undefined && max === undefined) return null;
    const f = (n?: number) => (n === undefined ? '…' : n.toLocaleString());
    return `${cur ? `${cur} ` : ''}${f(min)} – ${f(max)}`;
  };
  const parts = [
    modality,
    range(rates?.payrollMin, rates?.payrollMax, payrollCurrency) && `${t('talents.payroll')} ${range(rates?.payrollMin, rates?.payrollMax, payrollCurrency)}`,
    range(rates?.rxhMin, rates?.rxhMax, rxhCurrency) && `${t('talents.rxhShort')} ${range(rates?.rxhMin, rates?.rxhMax, rxhCurrency)}`,
  ].filter(Boolean) as string[];
  return (
    <div className="rates-line" data-testid="rates" title={rates?.notes || undefined}>
      <Icon name="wallet" size={15} />
      {parts.length ? parts.map((p, i) => <span key={i}>{p}</span>) : <span className="muted">{t('talents.noRates')}</span>}
    </div>
  );
}
