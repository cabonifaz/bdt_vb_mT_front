// Imágenes y archivos para una solicitud de soporte: elegir, arrastrar o pegar una captura (Ctrl+V).
// Cada archivo se sube al elegirlo (queda listo para adjuntar al enviar). Hasta 10, 5 MB cada uno.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ImagePlus, X } from 'lucide-react';
import { uploadSupportFile } from '../../lib/support';
import { useErrorText } from '../ui';

export type Picked = { key: string; name: string; preview?: string; id?: string; error?: string };
const MAX = 10;
const OK = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/;

export function AttachmentPicker({ files, onChange }: { files: Picked[]; onChange: (f: Picked[]) => void }) {
  const { t } = useTranslation();
  const errText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const latest = useRef(files);
  latest.current = files;

  const add = (list: File[]) => {
    const room = MAX - latest.current.length;
    const chosen = list.filter((f) => OK.test(f.type)).slice(0, room);
    if (!chosen.length) return;
    const items = chosen.map((f) => ({ key: crypto.randomUUID(), name: f.name || 'captura.png', preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined }));
    onChange([...latest.current, ...items]);
    chosen.forEach((f, i) => {
      const key = items[i].key;
      const named = f.name ? f : new File([f], 'captura.png', { type: f.type });
      uploadSupportFile(named)
        .then((id) => onChange(latest.current.map((x) => (x.key === key ? { ...x, id } : x))))
        .catch((e) => onChange(latest.current.map((x) => (x.key === key ? { ...x, error: errText(e) } : x))));
    });
  };

  // pegar una captura de pantalla en cualquier parte del modal
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (imgs.length) { e.preventDefault(); add(imgs); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="field">
      <label>{t('support.attachments')}</label>
      <div className={`drop-zone${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files)); }}>
        <input ref={input} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} data-testid="support-file" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={files.length >= MAX}>
          <ImagePlus size={15} />{t('support.addImages')}</button>
        <span className="muted">{t('support.dropHint')}</span>
      </div>
      {files.length > 0 && (
        <ul className="thumbs" data-testid="support-thumbs">
          {files.map((f) => (
            <li key={f.key} className={f.error ? 'err' : f.id ? 'ok' : 'busy'} title={f.error ?? f.name}>
              {f.preview ? <img src={f.preview} alt={f.name} /> : <FileText size={22} aria-hidden />}
              <span className="thumb-name">{f.error ? f.error : f.id ? f.name : t('support.uploading')}</span>
              <button type="button" className="thumb-x" aria-label={t('support.removeFile', { name: f.name })}
                onClick={() => { if (f.preview) URL.revokeObjectURL(f.preview); onChange(files.filter((x) => x.key !== f.key)); }}><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
