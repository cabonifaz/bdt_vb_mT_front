import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL, getAccessToken, http, refreshSession } from '../../lib/api';
import { useLabel } from '../../lib/talents';
import { useInterviewCatalogs, type Interview } from '../../lib/modules';
import { Button, Modal, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { Loader } from '../../components/ui/Loader';

/** Archivos de la entrevista (cifrados en el servidor); la subida se hace en modal. */
export function InterviewFiles({ interview, canWrite, onChanged }: { interview: Interview; canWrite: boolean; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const cat = useInterviewCatalogs();
  const toast = useToast();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const types = cat.byTable('INTERVIEW_FILE_TYPE');
  const download = async (fid: string, name: string) => {
    const get = () => fetch(`${API_URL}/api/v1/tenant/interviews/files/${fid}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, credentials: 'include' });
    let res = await get();
    if (res.status === 401 && (await refreshSession())) res = await get();
    if (!res.ok) { toast.error(t('errors.default')); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <section className="pf-section">
      <header><h3>{t('talents.files')}</h3>
        {canWrite && <button className="icon-ghost" onClick={() => setOpen(true)} aria-label={t('talents.upload')} title={t('talents.upload')} data-testid="iv-upload"><Icon name="plus" size={16} /></button>}</header>
      {interview.files.length === 0 && <p className="pf-empty">{t('talents.empty')}</p>}
      {interview.files.map((f) => (
        <div key={f.id} className="pf-item compact" data-testid="iv-file">
          <Icon name="file" size={15} />
          <div className="grow" style={{ minWidth: 0 }}>
            <button className="link-btn" onClick={() => download(f.id, f.name)}>{f.name}</button>
            <div className="pf-item-meta">{label(types.find((x) => x.code === f.category)?.label) || f.category} · {formatDate(f.createdAt, i18n.language)}</div>
          </div>
          {canWrite && <button className="icon-ghost danger" aria-label={t('talents.delete')} onClick={async () => {
            if (!window.confirm(t('talents.confirmDelete'))) return;
            try { await http.del(`/api/v1/tenant/interviews/files/${f.id}`); onChanged(); } catch (e) { toast.error(errText(e)); }
          }}><Icon name="trash" size={15} /></button>}
        </div>
      ))}
      {open && <UploadInterviewFile interviewId={interview.id} types={types.map((x) => ({ id: x.id, name: label(x.label) }))}
        onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </section>
  );
}

function UploadInterviewFile({ interviewId, types, onClose, onDone }: { interviewId: string; types: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const errText = useErrorText();
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open title={t('talents.upload')} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={busy} disabled={!file || !typeId} onClick={async () => {
        setBusy(true); setError(null);
        const fd = new FormData(); fd.append('file', file!);
        try { await http.post(`/api/v1/tenant/interviews/${interviewId}/files?typeId=${typeId}`, fd); onDone(); }
        catch (e) { setError(errText(e)); } finally { setBusy(false); }
      }}>{t('common.save')}</Button>
    </>}>
      {error && <div className="alert alert-error">{error}</div>}
      {busy && <Loader variant="overlay" label={t('common.uploading')} />}
      <div className="field"><label htmlFor="ivf-type">{t('talents.category')}</label>
        <select id="ivf-type" className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>{types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div className="field"><label htmlFor="ivf-file">{t('talents.files')}</label>
        <input id="ivf-file" type="file" accept=".pdf,.doc,.docx,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="iv-file-input" />
        <span className="hint">{t('talents.fileHint')}</span></div>
    </Modal>
  );
}
