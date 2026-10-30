// Soporte: el usuario ve y conversa sus solicitudes; el Super Admin (admin) ve todas, responde y cambia el estado.
// Novedades: lista para todos; el Super Admin publica (se notifica a todos los usuarios).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileText, LifeBuoy, MapPin, Paperclip, Plus, Sparkles } from 'lucide-react';
import {
  SUPPORT_STATUSES, publishRelease, replyTicket, supportFileBlob, useReleases, useTicket, useTickets,
  type SupportAttachment, type SupportStatus, type SupportSummary,
} from '../../lib/support';
import { Button, Card, Field, Modal, formatDate, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Loader } from '../../components/ui/Loader';
import { AttachmentPicker, type Picked } from '../../components/support/AttachmentPicker';
import { ReportModal } from '../../components/support/ReportButton';
import { currentOrigin } from '../../lib/support';
import { RELEASE_MODULES } from '../../components/tour/tours';
import { openTour } from '../../components/tour/Tour';

const utc = (s: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
const when = (s: string, lang: string) => formatDate(utc(s), lang);

function StatusBadge({ status }: { status: SupportStatus }) {
  const { t } = useTranslation();
  return <span className={`badge sup-st sup-st-${status.toLowerCase()}`} data-testid="support-status">{t(`support.status.${status}`)}</span>;
}

/** Bandeja: base = '/:tenant' o '/admin'; admin = Super Admin. */
export function SupportList({ admin = false }: { admin?: boolean }) {
  const { t, i18n } = useTranslation();
  const { tenant = '' } = useParams();
  const base = admin ? '/admin' : `/${tenant}`;
  const [status, setStatus] = useState(admin ? 'ACTIVE' : '');
  const [q, setQ] = useState('');
  const [reporting, setReporting] = useState(false);
  const list = useTickets(status, q);
  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t(admin ? 'support.adminTitle' : 'support.myTitle')}</h1><p className="muted">{t(admin ? 'support.adminSubtitle' : 'support.mySubtitle')}</p></div>
        {!admin && <Button onClick={() => setReporting(true)} data-testid="support-new"><Plus size={16} />{t('support.newTitle')}</Button>}
      </div>
      <Card>
        <div className="list-toolbar" data-testid="support-filters">
          <input className="input list-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('support.search')} aria-label={t('common.search')} />
          <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('support.statusFilter')} data-testid="support-status-filter">
            <option value="">{t('support.allStatuses')}</option>
            <option value="ACTIVE">{t('support.active')}</option>
            {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{t(`support.status.${s}`)}</option>)}
          </select>
        </div>
        <ul className="support-list" data-testid="support-list">
          {(list.data ?? []).map((x) => <TicketRow key={x.id} x={x} base={base} admin={admin} lang={i18n.language} />)}
        </ul>
        {list.isLoading && <Loader />}
        {list.data?.length === 0 && <div className="empty">{t(admin ? 'support.emptyAdmin' : 'support.empty')}</div>}
      </Card>
      {reporting && <ReportModal origin={currentOrigin(location.pathname)} onClose={() => setReporting(false)} />}
    </div>
  );
}

function TicketRow({ x, base, admin, lang }: { x: SupportSummary; base: string; admin: boolean; lang: string }) {
  const { t } = useTranslation();
  return (
    <li data-testid="support-row">
      <Link to={`${base}/soporte/${x.id}`} className="support-row">
        <span className={`sup-kind sup-kind-${x.kind.toLowerCase()}`}>{t(`support.kinds.${x.kind}`)}</span>
        <span className="grow">
          <strong>#{x.number} · {x.title}</strong>
          <span className="muted support-row-meta">
            {admin && <>{x.tenant.name} · {x.reporterName} · </>}
            {x.origin?.screen || x.origin?.module} · {when(x.updatedAt, lang)}
            {x.attachments > 0 && <> · <Paperclip size={12} aria-hidden /> {x.attachments}</>}
          </span>
        </span>
        {x.impact === 'HIGH' && <span className="badge badge-danger">{t('support.impacts.HIGH')}</span>}
        <StatusBadge status={x.status} />
      </Link>
    </li>
  );
}

export function SupportDetail({ admin = false }: { admin?: boolean }) {
  const { t, i18n } = useTranslation();
  const { tenant = '', id = '' } = useParams();
  const base = admin ? '/admin' : `/${tenant}`;
  const q = useTicket(id);
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<SupportStatus | ''>('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <Loader />;
  if (q.isError || !q.data) return <div className="page"><div className="alert alert-error" role="alert">{errText(q.error)}</div></div>;
  const tk = q.data;
  const uploading = files.some((f) => !f.id && !f.error);
  const canSend = !uploading && (body.trim() || (tk.canManage && status && status !== tk.status));
  const send = async () => {
    setBusy(true);
    try {
      await replyTicket(tk.id, body.trim(), tk.canManage ? status : '', files.filter((f) => f.id).map((f) => f.id!));
      setBody(''); setStatus(''); setFiles([]);
      toast.success(t('support.replied'));
      void qc.invalidateQueries({ queryKey: ['support'] });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const o = tk.origin;
  return (
    <div className="page support-detail">
      <Link to={`${base}/soporte`} className="back-link"><ArrowLeft size={15} />{t('support.back')}</Link>
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>#{tk.number} · {tk.title}</h1>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className={`sup-kind sup-kind-${tk.kind.toLowerCase()}`}>{t(`support.kinds.${tk.kind}`)}</span>
            <span className="badge badge-neutral">{t('support.impactShort', { impact: t(`support.impacts.${tk.impact}`) })}</span>
            <StatusBadge status={tk.status} />
          </div>
        </div>
      </div>
      <div className="support-grid">
        <section className="support-thread" aria-label={t('support.conversation')} data-testid="support-thread">
          {tk.messages.map((m) => (
            <article key={m.id} className={`sup-msg${m.isStaff ? ' staff' : ''}`} data-testid="support-message">
              <header><strong>{m.isStaff ? t('support.team') : m.authorName}</strong>{m.isStaff && admin && <span className="muted"> · {m.authorName}</span>}
                <span className="muted"> · {when(m.at, i18n.language)}</span></header>
              {m.body && <p className="pre">{m.body}</p>}
              {m.statusTo && <div className="sup-status-change">{t('support.statusChanged')} <StatusBadge status={m.statusTo} /></div>}
              {m.attachments.length > 0 && <div className="sup-atts">{m.attachments.map((a) => <Attachment key={a.id} a={a} />)}</div>}
            </article>
          ))}
          <div className="sup-reply" data-testid="support-reply">
            <label htmlFor="sup-reply" className="sr-only">{t('support.reply')}</label>
            <textarea id="sup-reply" className="textarea" rows={3} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={t(tk.canManage ? 'support.replyStaff' : tk.status === 'CLOSED' ? 'support.replyReopen' : 'support.replyUser')} data-testid="support-reply-body" />
            <AttachmentPicker files={files} onChange={setFiles} />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {tk.canManage && (
                <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as SupportStatus | '')} aria-label={t('support.setStatus')} data-testid="support-reply-status">
                  <option value="">{t('support.statusAuto')}</option>
                  {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{t(`support.status.${s}`)}</option>)}
                </select>
              )}
              <span className="spacer" />
              <Button onClick={send} loading={busy} disabled={!canSend} data-testid="support-reply-send">{t('support.sendReply')}</Button>
            </div>
          </div>
        </section>
        <aside className="support-side">
          <Card title={t('support.originTitle')}>
            <dl className="kv" data-testid="support-origin-detail">
              <dt><MapPin size={13} aria-hidden /> {t('support.screen')}</dt><dd>{o.screen || '—'}</dd>
              <dt>{t('support.module')}</dt><dd>{o.module || '—'}</dd>
              <dt>{t('support.path')}</dt><dd className="mono">{o.path}</dd>
              {admin && <><dt>{t('support.company')}</dt><dd>{tk.tenant.name}</dd><dt>{t('support.reporter')}</dt><dd>{tk.reporter.name}</dd></>}
              <dt>{t('support.device')}</dt><dd>{o.app === 'pwa' ? t('support.pwa') : t('support.browser')} · {o.viewport}</dd>
              <dt>{t('support.createdAt')}</dt><dd>{when(tk.createdAt, i18n.language)}</dd>
            </dl>
            {!admin && <Link to={o.path} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}><ExternalLink size={14} />{t('support.goScreen')}</Link>}
          </Card>
          {(tk.refs ?? []).length > 0 && (
            <Card title={t('support.refs')}>
              <ul className="sup-refs" data-testid="support-refs">{tk.refs!.map((r, i) => (
                <li key={i}>{/^https?:\/\//i.test(r) ? <a href={r} target="_blank" rel="noopener noreferrer">{r}</a> : r}</li>
              ))}</ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Attachment({ a }: { a: SupportAttachment }) {
  const toast = useToast();
  const errText = useErrorText();
  const [src, setSrc] = useState<string | null>(null);
  const image = a.mimeType.startsWith('image/');
  const open = async () => {
    try { window.open(src ?? URL.createObjectURL(await supportFileBlob(a.id)), '_blank', 'noopener'); } catch (e) { toast.error(errText(e)); }
  };
  // miniatura de las imágenes (se libera al salir)
  useEffect(() => {
    if (!image) return;
    let url = '';
    let alive = true;
    supportFileBlob(a.id).then((b) => { if (alive) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => alive && setSrc(''));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [a.id, image]);
  return (
    <button type="button" className="sup-att" onClick={open} title={a.name} data-testid="support-attachment">
      {image && src ? <img src={src} alt={a.name} /> : <FileText size={22} aria-hidden />}
      <span>{a.name}</span>
    </button>
  );
}

/** Novedades: todos las ven; el Super Admin publica. */
export function ReleasesPage({ admin = false }: { admin?: boolean }) {
  const { t, i18n } = useTranslation();
  const { tenant = '' } = useParams();
  const nav = useNavigate();
  const list = useReleases();
  const [creating, setCreating] = useState(false);
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es';
  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('news.title')}</h1><p className="muted">{t(admin ? 'news.adminSubtitle' : 'news.subtitle')}</p></div>
        {admin && <Button onClick={() => setCreating(true)} data-testid="release-new"><Sparkles size={16} />{t('news.publish')}</Button>}
      </div>
      <div className="release-list" data-testid="release-list">
        {(list.data ?? []).map((r) => {
          const mod = RELEASE_MODULES.find((m) => m.module === r.module);
          return (
            <Card key={r.id}>
              <div className="release-item" data-testid="release-item">
                <div className="muted" style={{ fontSize: 12 }}>{when(r.publishedAt, i18n.language)}</div>
                <h3>{r.title[lang] ?? r.title.es}</h3>
                <p className="pre">{r.body[lang] ?? r.body.es}</p>
                {!admin && mod && (
                  <div className="row" style={{ gap: 8 }}>
                    <Button size="sm" variant="secondary" onClick={() => { nav(`/${tenant}/${mod.path}`); if (r.tourKey) window.setTimeout(() => openTour(r.tourKey!), 900); }}>
                      <LifeBuoy size={14} />{t(r.tourKey ? 'news.openGuide' : 'news.open')}</Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {list.isLoading && <Loader />}
        {list.data?.length === 0 && <div className="empty">{t('news.empty')}</div>}
      </div>
      {creating && <PublishModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function PublishModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [v, setV] = useState({ titleEs: '', titleEn: '', bodyEs: '', bodyEn: '', module: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const mod = RELEASE_MODULES.find((m) => m.module === v.module);
      await publishRelease({ title: { es: v.titleEs.trim(), en: v.titleEn.trim() }, body: { es: v.bodyEs.trim(), en: v.bodyEn.trim() }, module: v.module, tourKey: mod?.tour ?? '' });
      toast.success(t('news.published'));
      void qc.invalidateQueries({ queryKey: ['releases'] });
      onClose();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open persistent title={t('news.publish')} onClose={onClose} footer={<>
      <span className="spacer" />
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button onClick={save} loading={busy} disabled={!v.titleEs.trim() || !v.bodyEs.trim()} data-testid="release-save">{t('news.publishNow')}</Button></>}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <p className="muted" style={{ marginTop: 0 }}>{t('news.publishHint')}</p>
      <Field label={t('news.titleEs')} required maxLength={200} value={v.titleEs} onChange={(e) => setV({ ...v, titleEs: e.target.value })} data-testid="release-title" />
      <div className="field"><label htmlFor="rel-body-es">{t('news.bodyEs')}</label>
        <textarea id="rel-body-es" className="textarea" rows={4} maxLength={5000} value={v.bodyEs} onChange={(e) => setV({ ...v, bodyEs: e.target.value })} data-testid="release-body" /></div>
      <Field label={t('news.titleEn')} maxLength={200} value={v.titleEn} onChange={(e) => setV({ ...v, titleEn: e.target.value })} />
      <div className="field"><label htmlFor="rel-body-en">{t('news.bodyEn')}</label>
        <textarea id="rel-body-en" className="textarea" rows={3} maxLength={5000} value={v.bodyEn} onChange={(e) => setV({ ...v, bodyEn: e.target.value })} /></div>
      <div className="field"><label htmlFor="rel-mod">{t('news.module')}</label>
        <select id="rel-mod" className="select" value={v.module} onChange={(e) => setV({ ...v, module: e.target.value })}>
          <option value="">{t('news.noModule')}</option>
          {RELEASE_MODULES.map((m) => <option key={m.module} value={m.module}>{t(`news.modules.${m.module}`)}</option>)}
        </select>
        <span className="hint">{t('news.moduleHint')}</span></div>
    </Modal>
  );
}
