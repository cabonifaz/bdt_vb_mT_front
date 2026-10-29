import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, X } from 'lucide-react';

export interface SearchOption { value: string; label: string; hint?: string }

/** Normaliza para buscar: minúsculas y sin tildes. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SHOWN = 50;

// Dentro de un modal con scroll, la lista abierta se trae a la vista (si ya se ve, no se mueve nada).
const keepInView = (el: HTMLUListElement | null) => el?.scrollIntoView({ block: 'nearest' });

/**
 * Combo con búsqueda para listados grandes (clientes, usuarios...).
 * - `options`: filtra en memoria (catálogos ya cargados).
 * - `load`: busca en el servidor con debounce a partir de `minChars` (nunca trae el listado completo).
 * El input es el control accesible (role=combobox), así `getByLabel(label)` lo encuentra.
 */
export function SearchSelect({ label, value, onChange, options, load, selectedLabel, placeholder, minChars = 0, id, compact, emptyLabel, testId }: {
  label?: string; value: string; onChange: (value: string, option?: SearchOption) => void;
  options?: SearchOption[]; load?: (q: string) => Promise<SearchOption[]>;
  /** etiqueta del valor actual cuando no está en `options` (modo `load`) */
  selectedLabel?: string;
  placeholder?: string; minChars?: number; id?: string; compact?: boolean;
  /** texto que se muestra cuando value === '' (p. ej. «Cualquier cliente») */
  emptyLabel?: string; testId?: string;
}) {
  const { t } = useTranslation();
  const auto = useId();
  const fid = id ?? auto;
  const listId = `${fid}-list`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = options?.find((o) => o.value === value)?.label ?? (value ? selectedLabel : '') ?? '';
  const enough = fold(q).length >= minChars;

  useEffect(() => {
    if (!load || !open) return;
    if (!enough) { setRemote([]); return; }
    let alive = true;
    setLoading(true);
    const h = window.setTimeout(() => {
      load(q).then((r) => { if (alive) setRemote(r); }).catch(() => { if (alive) setRemote([]); }).finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; window.clearTimeout(h); };
  }, [load, q, open, enough]);

  const matches = useMemo(() => {
    if (load) return remote;
    const n = fold(q);
    return (options ?? []).filter((o) => !n || fold(o.label).includes(n) || (o.hint && fold(o.hint).includes(n)));
  }, [load, remote, options, q]);
  const shown = matches.slice(0, SHOWN);

  const pick = (o: SearchOption) => { onChange(o.value, o); setOpen(false); setQ(''); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQ(''); }
  };

  const input = (
    <div className={`ss${compact ? ' ss-compact' : ''}${open ? ' ss-open' : ''}`} data-testid={testId}>
      <Search size={15} className="ss-ico" aria-hidden />
      <input ref={inputRef} id={fid} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-label={label ? undefined : placeholder} autoComplete="off"
        placeholder={current || emptyLabel || placeholder || t('common.search')}
        value={open ? q : current || ''}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => { setOpen(false); setQ(''); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKey} />
      {value && !open
        ? <button type="button" className="ss-btn" aria-label={t('common.clear')} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange('')}><X size={14} /></button>
        : <ChevronDown size={15} className="ss-btn" aria-hidden />}
      {open && (
        <ul id={listId} role="listbox" className="ss-list" ref={keepInView} onMouseDown={(e) => e.preventDefault()}>
          {!enough && <li className="ss-note">{t('common.typeMin', { count: minChars })}</li>}
          {enough && loading && shown.length === 0 && <li className="ss-note">{t('common.loading')}</li>}
          {enough && !loading && shown.length === 0 && <li className="ss-note">{t('common.noResults')}</li>}
          {shown.map((o, i) => (
            <li key={o.value || '_'} role="option" aria-selected={o.value === value} className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              <span>{o.label}</span>{o.hint && <span className="ss-hint">{o.hint}</span>}
            </li>
          ))}
          {matches.length > SHOWN && <li className="ss-note">{t('common.moreResults', { count: matches.length - SHOWN })}</li>}
        </ul>
      )}
    </div>
  );
  if (!label) return input;
  return <div className="field"><label htmlFor={fid}>{label}</label>{input}</div>;
}
