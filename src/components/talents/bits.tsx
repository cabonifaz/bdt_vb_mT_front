import { useEffect, useState } from 'react';
import { fetchFileBlob } from '../../lib/talents';

/** Estrellas (solo lectura o editable). */
export function Stars({ value, onChange, size = 16, label }: { value?: number | null; onChange?: (v: number) => void; size?: number; label?: string }) {
  const v = Math.round(value ?? 0);
  if (!onChange) {
    return (
      <span className="stars" role="img" aria-label={label ?? `${value ?? 0} / 5`} style={{ fontSize: size }}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= v ? 'star on' : 'star'}>★</span>)}
      </span>
    );
  }
  return (
    <span className="stars" role="radiogroup" aria-label={label} style={{ fontSize: size + 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={i === v} aria-label={`${i}`}
          className={i <= v ? 'star on' : 'star'} onClick={() => onChange(i)}>★</button>
      ))}
    </span>
  );
}

/** Foto protegida: se descarga con el token y se muestra como blob (las <img> no envían Authorization). */
export function TalentPhoto({ fileId, name, size = 64 }: { fileId?: string; name: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!fileId) { setSrc(null); return; }
    let url: string | null = null;
    let alive = true;
    fetchFileBlob(fileId, true).then((b) => { if (alive) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => setSrc(null));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [fileId]);
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return src
    ? <img src={src} alt={name} className="talent-photo" style={{ width: size, height: size }} />
    : <span className="talent-photo placeholder" style={{ width: size, height: size, fontSize: size / 2.6 }} aria-hidden>{initials}</span>;
}

export function Chip({ children, onRemove, removeLabel }: { children: React.ReactNode; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span className="chip">
      {children}
      {onRemove && <button type="button" className="chip-x" aria-label={removeLabel} onClick={onRemove}>×</button>}
    </span>
  );
}

export function Pagination({ page, total, pageSize, onPage, labels }: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void; labels: { prev: string; next: string; of: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="row" aria-label="paginación" style={{ justifyContent: 'center' }}>
      <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{labels.prev}</button>
      <span className="muted">{page} {labels.of} {pages}</span>
      <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{labels.next}</button>
    </nav>
  );
}
