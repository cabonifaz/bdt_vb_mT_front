// Chips de la ficha que se editan sin abrir el editor: disponibilidad (menú) y equipo propio (alterna con un clic).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { useLabel, useMasters } from '../../lib/talents';

export function AvailabilityChip({ value, editable, onChange }: { value?: string; editable: boolean; onChange: (id: string | null) => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const options = useMasters().byTable('TALENT_AVAILABILITY');
  const current = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const text = current ? label(current.label) : t('talents.availability');
  if (!editable) return current ? <span className="meta-chip" title={t('talents.availability')}><Icon name="clock" size={13} />{text}</span> : null;
  const pick = (id: string | null) => { setOpen(false); if (id !== (value ?? null)) onChange(id); };
  return (
    <div className="qc" ref={ref}>
      <button type="button" className={`meta-chip qc-btn${current ? '' : ' qc-empty'}`} aria-haspopup="menu" aria-expanded={open}
        title={`${t('talents.availability')}: ${current ? text : t('talents.cp.notSet')}`} onClick={() => setOpen((o) => !o)} data-testid="availability-chip">
        <Icon name="clock" size={13} />{text}
      </button>
      {open && (
        <div className="qc-menu" role="menu" aria-label={t('talents.availability')}>
          {options.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={o.id === value} onClick={() => pick(o.id)}>
              <span className="qc-check">{o.id === value && <Check size={14} />}</span>{label(o.label)}
            </button>
          ))}
          {value && <button type="button" role="menuitem" className="qc-clear" onClick={() => pick(null)}>{t('common.clear')}</button>}
        </div>
      )}
    </div>
  );
}

/** Sin dato -> Sí -> No -> Sí ... (un clic cambia el valor) */
export function EquipmentChip({ value, editable, onChange }: { value?: boolean | null; editable: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const known = value !== undefined && value !== null;
  const text = !known ? t('talents.ownEquipment') : value ? t('talents.ownEquipment') : t('talents.noEquipment');
  if (!editable) return known ? <span className="meta-chip" title={t('talents.hasEquipment')}><Icon name="laptop" size={13} />{text}</span> : null;
  return (
    <button type="button" className={`meta-chip qc-btn${known ? (value ? ' qc-on' : '') : ' qc-empty'}`} aria-pressed={known ? !!value : 'mixed'}
      title={`${t('talents.hasEquipment')} ${t('talents.cp.clickToToggle')}`} onClick={() => onChange(!known ? true : !value)} data-testid="equipment-chip">
      <Icon name="laptop" size={13} />{text}
    </button>
  );
}
