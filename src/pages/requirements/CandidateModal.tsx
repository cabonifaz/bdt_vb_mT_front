// Postulante dentro del RQ: documentos que pide el RQ (cargar, ver, validar) y línea de tiempo del proceso.
// Validación manual: aprobar o rechazar con motivo (analistas, jefe y admin). CUL: automática contra el MTPE al cargarlo
// (el código y el documento salen del QR leído en el navegador); si quedó pendiente se puede reconsultar.
// Faltantes o sin validar solo se avisan: no bloquean etapas.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, Clock, ExternalLink, FileText, RefreshCw, ShieldCheck, Upload, UserPlus, UserX, XCircle, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '../../providers/auth';
import { fetchFileBlob, useLabel } from '../../lib/talents';
import { fullTalentName } from '../../lib/requirements';
import {
  byOrder, dayLabel, readCulQr, utcISO, recheckDocument, uploadDocument, useCandidateDetail, verifyDocument,
  type CandidateDetail, type CandidateEvent, type DocStatus,
} from '../../lib/documents';
import { isPdf } from '../../lib/cv/readCv';
import { Button, Modal, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { TalentPhoto } from '../../components/talents/bits';
import { ResignationBadge } from './ResignationBadge';

type Tab = 'documents' | 'process';

export function CandidateModal({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const { tenant = '' } = useParams();
  const q = useCandidateDetail(candidateId);
  const [tab, setTab] = useState<Tab>('documents');
  const c = q.data;
  const req = c?.documents.filter((d) => d.mode === 'REQUIRED') ?? [];
  const verified = req.filter((d) => d.current?.status === 'VERIFIED').length;
  return (
    <Modal open wide title={c ? fullTalentName(c.talent) : t('common.loading')} onClose={onClose}
      tabs={<div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'documents'} onClick={() => setTab('documents')} data-testid="cand-tab-documents">
          {t('cand.tab.documents')}{c && c.documents.length > 0 && <span className="count">{verified}/{req.length}</span>}</button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'process'} onClick={() => setTab('process')} data-testid="cand-tab-process">{t('cand.tab.process')}</button>
      </div>}
      footer={<><span className="spacer" /><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button></>}>
      {q.isLoading || !c ? <Loader /> : <>
        <div className="cand-head">
          <TalentPhoto fileId={c.talent.photoId ?? undefined} name={fullTalentName(c.talent)} size={40} />
          <div className="grow">
            <div className="muted">{[c.talent.headline, label(c.vacancy.profile)].filter(Boolean).join(' · ')}</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span className="badge badge-neutral" data-testid="cand-stage">{label(c.stage.label)}</span>
              {c.resignation && <ResignationBadge r={c.resignation} />}
            </div>
          </div>
          <Link to={`/${tenant}/talentos/${c.talent.id}`} className="btn btn-secondary btn-sm"><ExternalLink size={14} />{t('cand.openTalent')}</Link>
        </div>
        {tab === 'documents' && <DocumentsPanel c={c} />}
        {tab === 'process' && <Timeline c={c} />}
      </>}
    </Modal>
  );
}

const STATUS_ICON: Record<DocStatus, typeof CheckCircle2> = {
  VERIFIED: CheckCircle2, PENDING: Clock, REJECTED: XCircle, EXPIRED: XCircle, MISSING: CircleDashed,
};

function DocStatusBadge({ status }: { status: DocStatus }) {
  const { t } = useTranslation();
  const I = STATUS_ICON[status];
  return <span className={`badge doc-st doc-st-${status.toLowerCase()}`} data-testid="doc-status"><I size={12} aria-hidden />{t(`docs.status.${status}`)}</span>;
}

function DocumentsPanel({ c }: { c: CandidateDetail }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canAct = can('rq.candidates') && !c.requirement.closed && !c.resignation;
  if (c.documents.length === 0) return <p className="muted" data-testid="cand-docs-empty">{t('cand.noDocs')}</p>;
  return (
    <div className="doc-list" data-testid="cand-docs">
      {[...c.documents].sort(byOrder).map((d) => <DocRow key={d.typeId} c={c} d={d} canAct={canAct} />)}
    </div>
  );
}

function DocRow({ c, d, canAct }: { c: CandidateDetail; d: CandidateDetail['documents'][number]; canAct: boolean }) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'verify' | 'recheck'>('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const cur = d.current;
  const status: DocStatus = cur?.status ?? 'MISSING';
  const isCul = d.verification === 'AUTO_CUL';
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['rq-candidate', c.id] });
    void qc.invalidateQueries({ queryKey: ['rq', c.requirement.id] });
  };
  const verdictToast = (status: string, reason: string) => {
    if (status === 'VERIFIED') toast.success(t('cand.culVerified'));
    else if (status === 'REJECTED') toast.error(t(`docs.reason.${reason}`, reason));
    else toast.info(t(`docs.reason.${reason}`, reason));
  };

  const upload = async (f: File) => {
    setBusy('upload');
    try {
      // CUL: el código y el documento salen del QR (si no es PDF o no se lee, queda pendiente con el motivo)
      const qr = isCul && isPdf(f) ? await readCulQr(f).catch(() => null) : null;
      const v = await uploadDocument(c.id, d.typeId, f, qr);
      if (isCul) verdictToast(v.status, v.reason); else toast.success(t('cand.uploaded'));
      refresh();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(''); if (file.current) file.current.value = ''; }
  };
  const verify = async (approve: boolean) => {
    if (!cur) return;
    setBusy('verify');
    try {
      await verifyDocument(c.id, cur.id, approve, reason.trim());
      toast.success(t(approve ? 'cand.approved' : 'cand.rejected'));
      setRejecting(false); setReason('');
      refresh();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const recheck = async () => {
    if (!cur) return;
    setBusy('recheck');
    try {
      const v = await recheckDocument(c.id, cur.id, cur.autoResult?.code ? { code: cur.autoResult.code, docNumber: cur.autoResult.docNumber ?? '' } : null);
      verdictToast(v.status, v.reason);
      refresh();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const open = async () => {
    if (!cur) return;
    try { window.open(URL.createObjectURL(await fetchFileBlob(cur.fileId, true)), '_blank', 'noopener'); } catch (e) { toast.error(errText(e)); }
  };
  const date = (s?: string | null) => (s ? formatDate(utcISO(s), i18n.language) : '');
  const day = (s?: string | null) => (s ? dayLabel(s, i18n.language) : '');

  return (
    <div className={`doc-row doc-row-${status.toLowerCase()}`} data-testid={`cand-doc-${d.code}`}>
      <div className="doc-row-main">
        <FileText size={18} className="doc-row-ico" aria-hidden />
        <div className="grow">
          <div className="doc-row-title">
            <strong>{label(d.label)}</strong>
            <span className={`badge ${d.mode === 'REQUIRED' ? 'badge-warning' : 'badge-neutral'}`}>{t(`docs.usageOpt.${d.mode}`)}</span>
            <DocStatusBadge status={status} />
            {isCul && <span className="badge badge-neutral" title={t('docs.autoCulHint')}><ShieldCheck size={12} aria-hidden />{t('docs.verif.AUTO_CUL')}</span>}
          </div>
          {cur ? (
            <div className="doc-row-meta">
              <button type="button" className="link-button" onClick={open} data-testid="doc-open">{cur.fileName}</button>
              {' · '}{t('cand.uploadedOn', { date: date(cur.createdAt) })}
              {cur.expiresAt && <> · <span className={status === 'EXPIRED' ? 'text-danger' : ''}>{t(status === 'EXPIRED' ? 'cand.expiredOn' : 'cand.expiresOn', { date: day(cur.expiresAt) })}</span></>}
              {cur.fromOtherRq && <> · <span className="muted">{t('cand.fromOtherRq')}</span></>}
              {cur.verifiedAt && <div>{t(cur.status === 'REJECTED' ? 'cand.rejectedBy' : 'cand.verifiedBy', { name: cur.method === 'AUTO' ? t('cand.system') : cur.verifiedByName, date: date(cur.verifiedAt) })}</div>}
              {cur.reason && <div className={cur.status === 'REJECTED' ? 'text-danger' : 'muted'} data-testid="doc-reason">{t(`docs.reason.${cur.reason}`, cur.reason)}</div>}
              {cur.autoResult?.names && <div className="muted">{t('cand.culData', { code: cur.autoResult.code, names: cur.autoResult.names, date: cur.autoResult.issuedAt ? formatDate(cur.autoResult.issuedAt, i18n.language) : '—' })}</div>}
            </div>
          ) : <div className="doc-row-meta muted">{t('cand.notPresented')}</div>}
        </div>
      </div>
      {canAct && (
        <div className="doc-row-actions">
          <input ref={file} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} data-testid="doc-file" />
          <Button size="sm" variant="secondary" loading={busy === 'upload'} disabled={!!busy} onClick={() => file.current?.click()} data-testid="doc-upload">
            <Upload size={14} />{cur ? t('cand.replace') : t('cand.upload')}</Button>
          {cur && !isCul && cur.status !== 'VERIFIED' && status !== 'EXPIRED' && (
            <Button size="sm" loading={busy === 'verify'} disabled={!!busy} onClick={() => verify(true)} data-testid="doc-approve"><CheckCircle2 size={14} />{t('cand.approve')}</Button>
          )}
          {cur && !isCul && cur.status !== 'REJECTED' && status !== 'EXPIRED' && !rejecting && (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setRejecting(true)} data-testid="doc-reject"><XCircle size={14} />{t('cand.reject')}</Button>
          )}
          {cur && isCul && cur.status === 'PENDING' && (
            <Button size="sm" variant="secondary" loading={busy === 'recheck'} disabled={!!busy} onClick={recheck} data-testid="doc-recheck"><RefreshCw size={14} />{t('cand.recheck')}</Button>
          )}
        </div>
      )}
      {rejecting && (
        <div className="doc-reject-form">
          <input className="input" autoFocus maxLength={500} placeholder={t('cand.rejectReason')} aria-label={t('cand.rejectReason')} value={reason}
            onChange={(e) => setReason(e.target.value)} data-testid="doc-reject-reason" />
          <Button size="sm" variant="danger" disabled={!reason.trim() || !!busy} loading={busy === 'verify'} onClick={() => verify(false)} data-testid="doc-reject-confirm">{t('cand.reject')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setReason(''); }}>{t('common.cancel')}</Button>
        </div>
      )}
    </div>
  );
}

const EVENT_ICON: Record<CandidateEvent['type'], typeof CheckCircle2> = {
  ADDED: UserPlus, STAGE: ArrowRightLeft, DOC_UPLOADED: Upload, DOC_VERIFIED: CheckCircle2, DOC_REJECTED: XCircle, DOC_CHECK_FAILED: Clock, RESIGNED: UserX,
};

function Timeline({ c }: { c: CandidateDetail }) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const stages = new Map<string, string>([[c.stage.code, label(c.stage.label)]]);
  const docName = (code?: unknown) => {
    const d = c.documents.find((x) => x.code === code);
    return d ? label(d.label) : String(code ?? '');
  };
  const stageName = (code?: unknown) => stages.get(String(code)) ?? t(`cand.stages.${String(code)}`, String(code ?? ''));
  const text = (e: CandidateEvent) => {
    const x = e.data ?? {};
    switch (e.type) {
      case 'ADDED': return t('cand.ev.ADDED');
      case 'STAGE': return x.from === x.to ? t('cand.ev.VACANCY') : t('cand.ev.STAGE', { from: stageName(x.from), to: stageName(x.to) });
      case 'RESIGNED': return t('cand.ev.RESIGNED');
      default: return t(`cand.ev.${e.type}`, { doc: docName(x.type), reason: x.reason ? t(`docs.reason.${String(x.reason)}`, String(x.reason)) : '' });
    }
  };
  const events = [...c.events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="cand-timeline" data-testid="cand-timeline">
      {events.map((e, i) => {
        const I = EVENT_ICON[e.type] ?? Clock;
        return (
          <li key={i} className={`cand-timeline-item ev-${e.type.toLowerCase()}`} data-testid="cand-event">
            <span className="cand-timeline-dot" aria-hidden><I size={14} /></span>
            <div>
              <div>{text(e)}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {formatDate(utcISO(e.at), i18n.language)}
                {e.byName && ` · ${e.byName}`}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
