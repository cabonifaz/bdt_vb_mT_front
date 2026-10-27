// Alta / edición de entrevista en modal con pestañas. Los campos se adaptan al tipo:
// VIRTUAL (enlace + grabaciones), PRESENCIAL (Google Maps + dirección), TELEFÓNICA (cuestionario, sin enlace).
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { fullName, TALENT_API, useLabel, type TalentSummary } from '../../lib/talents';
import { GOOGLE_MAPS_RE, nextQuarter, todayISO, useInterviewCatalogs, type ClientItem, type Interview, type Interviewer, type Recording } from '../../lib/modules';
import { Button, Field, Modal, useErrorText } from '../../components/ui';
import { Icon } from '../../components/ui/Icon';
import { Stars } from '../../components/talents/bits';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { Loader } from '../../components/ui/Loader';

export interface InterviewPreset { talentId: string; talentName: string; typeCode?: string; stageCode?: string }
type Tab = 'general' | 'interviewers' | 'questions' | 'evaluation' | 'recordings';

export function InterviewEditor({ interview, preset, onClose, onSaved }: {
  interview?: Interview; preset?: InterviewPreset; onClose: () => void; onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const label = useLabel();
  const errText = useErrorText();
  const cat = useInterviewCatalogs();
  const editing = !!interview;
  const [id] = useState(interview?.id ?? crypto.randomUUID());
  const [talent, setTalent] = useState<{ id: string; name: string } | null>(
    interview ? { id: interview.talentId, name: fullName(interview) } : preset ? { id: preset.talentId, name: preset.talentName } : null);
  const [v, setV] = useState({
    typeId: interview?.typeId ?? '', stageId: interview?.stageId ?? '', statusId: interview?.statusId ?? '',
    durationId: interview?.durationId ?? '', clientId: interview?.clientId ?? '', requirementRef: interview?.requirementRef ?? '',
    profile: interview?.profile ?? '', date: interview?.date ?? todayISO(), time: interview?.time ?? nextQuarter(),
    meetingLink: interview?.meetingLink ?? '', locationUrl: interview?.locationUrl ?? '', address: interview?.address ?? '',
    cancelReason: interview?.cancelReason ?? '',
    ratingGeneral: interview?.ratingGeneral ?? 0, ratingPersonal: interview?.ratingPersonal ?? 0, ratingExperience: interview?.ratingExperience ?? 0,
    ratingLanguages: interview?.ratingLanguages ?? 0, ratingEducation: interview?.ratingEducation ?? 0,
    notesPersonal: interview?.notesPersonal ?? '', notesExperience: interview?.notesExperience ?? '',
    notesLanguages: interview?.notesLanguages ?? '', notesEducation: interview?.notesEducation ?? '',
  });
  const [interviewers, setInterviewers] = useState<Interviewer[]>(interview?.interviewers ?? []);
  const [recordings, setRecordings] = useState<Recording[]>(interview?.recordings ?? []);
  const [answers, setAnswers] = useState<Record<string, string>>(Object.fromEntries((interview?.answers ?? []).map((a) => [a.questionId, a.answer ?? ''])));
  const [tab, setTab] = useState<Tab>('general');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // valores por defecto al cargar catálogos (alta)
  useEffect(() => {
    if (editing || !cat.data) return;
    setV((cur) => ({
      ...cur,
      typeId: cur.typeId || cat.byCode('INTERVIEW_TYPE', preset?.typeCode ?? 'VIRTUAL')?.id || '',
      stageId: cur.stageId || (preset?.stageCode ? cat.byCode('INTERVIEW_STAGE', preset.stageCode)?.id ?? '' : ''),
      statusId: cur.statusId || cat.byCode('INTERVIEW_STATUS', 'REGISTERED')?.id || '',
      durationId: cur.durationId || cat.byTable('INTERVIEW_DURATION')[0]?.id || '',
    }));
  }, [cat.data, editing, preset?.typeCode, preset?.stageCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeCode = cat.byTable('INTERVIEW_TYPE').find((x) => x.id === v.typeId)?.code ?? '';
  const stageCode = cat.byTable('INTERVIEW_STAGE').find((x) => x.id === v.stageId)?.code ?? '';
  const statusCode = cat.byTable('INTERVIEW_STATUS').find((x) => x.id === v.statusId)?.code ?? '';
  const isPhone = typeCode === 'PHONE';
  const clients = cat.byTable('CLIENT') as ClientItem[];
  const client = clients.find((c) => c.id === v.clientId);

  // la entrevista telefónica precarga al usuario actual como entrevistador
  useEffect(() => {
    if (!editing && isPhone && interviewers.length === 0 && user) setInterviewers([{ name: user.fullName, email: user.email, notify: false }]);
  }, [isPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems: string[] = [];
  if (!talent) problems.push(t('interviews.err.talent'));
  if (!v.profile.trim()) problems.push(t('interviews.err.profile'));
  if (!v.stageId) problems.push(t('interviews.err.stage'));
  if (!isPhone && !v.clientId) problems.push(t('interviews.err.client'));
  if (typeCode === 'VIRTUAL' && !/^https:\/\/\S+$/.test(v.meetingLink)) problems.push(t('interviews.err.link'));
  if (typeCode === 'IN_PERSON' && !GOOGLE_MAPS_RE.test(v.locationUrl)) problems.push(t('interviews.err.maps'));
  if (typeCode === 'IN_PERSON' && !v.address.trim()) problems.push(t('interviews.err.address'));
  if (stageCode !== 'RS_TEAM' && !interviewers.some((x) => x.name.trim())) problems.push(t('interviews.err.interviewers'));
  if (interviewers.some((x) => x.notify && !x.email?.trim())) problems.push(t('interviews.err.notifyEmail'));

  const save = async (ack = false) => {
    setBusy(true); setError(null);
    const nz = (s: string) => (s.trim() ? s.trim() : null);
    const body = {
      id, talentId: talent!.id, typeId: v.typeId, stageId: v.stageId, statusId: v.statusId,
      durationId: isPhone ? null : nz(v.durationId), clientId: nz(v.clientId), requirementRef: nz(v.requirementRef), profile: v.profile.trim(),
      date: v.date, time: v.time, meetingLink: typeCode === 'VIRTUAL' ? nz(v.meetingLink) : null,
      locationUrl: typeCode === 'IN_PERSON' ? nz(v.locationUrl) : null, address: typeCode === 'IN_PERSON' ? nz(v.address) : null,
      cancelReason: statusCode === 'CANCELLED' ? nz(v.cancelReason) : null,
      ratingGeneral: v.ratingGeneral, ratingPersonal: v.ratingPersonal, ratingExperience: v.ratingExperience,
      ratingLanguages: v.ratingLanguages, ratingEducation: v.ratingEducation,
      notesPersonal: nz(v.notesPersonal), notesExperience: nz(v.notesExperience), notesLanguages: nz(v.notesLanguages), notesEducation: nz(v.notesEducation),
      interviewers: interviewers.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), email: x.email?.trim() || '', notify: !isPhone && x.notify })),
      recordings: typeCode === 'VIRTUAL' ? recordings : [],
      answers: isPhone ? cat.byTable('PHONE_QUESTION').map((q) => ({ question: q.id, answer: answers[q.id] ?? '' })) : undefined,
      acknowledgeBlacklist: ack,
      expectedVersion: interview?.version,
    };
    try {
      if (editing) await http.put(`/api/v1/tenant/interviews/${id}`, body, true);
      else await http.post('/api/v1/tenant/interviews', body, true);
      onSaved(id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TALENT_BLACKLISTED') {
        setBusy(false);
        if (window.confirm(t('interviews.blacklistConfirm', { name: talent!.name, client: client ? label(client.label) : '' }))) return save(true);
        return;
      }
      if (e instanceof ApiError && e.code === 'OFFLINE') { onSaved(id); return; }
      setError(errText(e));
    } finally { setBusy(false); }
  };

  // posiciones estables: los contadores siempre visibles y las pestañas que dependen del tipo van al final
  const tabs: { key: Tab; label: ReactNode; show: boolean }[] = [
    { key: 'general', label: t('interviews.tab.general'), show: true },
    { key: 'interviewers', label: <>{t('interviews.tab.interviewers')}<span className="count">{interviewers.length}</span></>, show: true },
    { key: 'evaluation', label: t('interviews.tab.evaluation'), show: editing },
    { key: 'questions', label: t('interviews.tab.questions'), show: isPhone },
    { key: 'recordings', label: <>{t('interviews.tab.recordings')}<span className="count">{recordings.length}</span></>, show: typeCode === 'VIRTUAL' },
  ];
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const opts = (table: string) => cat.byTable(table).map((x) => <option key={x.id} value={x.id}>{label(x.label)}</option>);

  return (
    <Modal open wide persistent title={editing ? t('interviews.edit') : t('interviews.new')} onClose={onClose}
      tabs={<div className="tabs" role="tablist">{tabs.filter((x) => x.show).map((x) => (
        <button key={x.key} role="tab" type="button" className="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)} data-testid={`itab-${x.key}`}>{x.label}</button>
      ))}</div>}
      footer={<>
        {problems.length > 0 && <span className="muted" style={{ fontSize: 12 }} title={problems.join('\n')}>{problems[0]}{problems.length > 1 ? ` (+${problems.length - 1})` : ''}</span>}
        <span className="spacer" />
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
        <Button onClick={() => save(false)} loading={busy} disabled={problems.length > 0} data-testid="save-interview">{t('common.save')}</Button>
      </>}>
      {busy && <Loader variant="overlay" label={t('common.savingDots')} />}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {tab === 'general' && <div className="stack">
        {!talent ? <TalentPicker onPick={setTalent} /> : (
          <div className="field"><span>{t('interviews.talent')}</span>
            <div className="row"><strong data-testid="iv-talent">{talent.name}</strong>
              {!editing && !preset && <button className="link-btn" onClick={() => setTalent(null)}>{t('interviews.change')}</button>}</div></div>
        )}
        <div className="field">
          <span>{t('interviews.type')}</span>
          <div className="seg" role="radiogroup" aria-label={t('interviews.type')}>
            {cat.byTable('INTERVIEW_TYPE').map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={v.typeId === x.id} className={`seg-btn${v.typeId === x.id ? ' on' : ''}`}
                onClick={() => setV({ ...v, typeId: x.id })} data-testid={`type-${x.code}`}>
                <Icon name={x.code === 'PHONE' ? 'phone' : x.code === 'IN_PERSON' ? 'mapPin' : 'video'} size={15} />{label(x.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <Field label={t('interviews.date')} type="date" value={v.date} onChange={f('date')} />
          <Field label={t('interviews.time')} type="time" step={300} value={v.time} onChange={f('time')} />
          {!isPhone && <div className="field"><label htmlFor="iv-dur">{t('interviews.duration')}</label>
            <select id="iv-dur" className="select" value={v.durationId} onChange={f('durationId')}>{opts('INTERVIEW_DURATION')}</select></div>}
        </div>
        {typeCode === 'VIRTUAL' && <Field label={t('interviews.link')} type="url" placeholder="https://meet.google.com/..." value={v.meetingLink} onChange={f('meetingLink')} />}
        {typeCode === 'IN_PERSON' && <>
          <div className="field">
            <label htmlFor="iv-maps">{t('interviews.mapsUrl')}</label>
            <input id="iv-maps" className="input" type="url" list="iv-dl-maps" placeholder="https://maps.app.goo.gl/..." value={v.locationUrl} onChange={f('locationUrl')} />
            <datalist id="iv-dl-maps">{clients.filter((c) => c.str3).map((c) => <option key={c.id} value={c.str3}>{label(c.label)}</option>)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="iv-addr">{t('interviews.address')}</label>
            <input id="iv-addr" className="input" list="iv-dl-addr" maxLength={500} value={v.address} onChange={f('address')} />
            <datalist id="iv-dl-addr">{clients.filter((c) => c.str2).map((c) => <option key={c.id} value={c.str2}>{label(c.label)}</option>)}</datalist>
          </div>
        </>}
        <div className="form-grid">
          <div className="field"><label htmlFor="iv-stage">{t('interviews.stage')}</label>
            <select id="iv-stage" className="select" value={v.stageId} onChange={f('stageId')}><option value="">—</option>{opts('INTERVIEW_STAGE')}</select></div>
          <div className="field"><label htmlFor="iv-status">{t('interviews.status')}</label>
            <select id="iv-status" className="select" value={v.statusId} onChange={f('statusId')}>{opts('INTERVIEW_STATUS')}</select></div>
          <Field label={t('interviews.profile')} maxLength={200} value={v.profile} onChange={f('profile')} />
          <SearchSelect id="iv-client" label={isPhone ? `${t('interviews.client')} (${t('interviews.optional')})` : t('interviews.client')} value={v.clientId}
            onChange={(id) => setV((c) => ({ ...c, clientId: id }))} placeholder={t('blacklist.searchClient')}
            options={clients.filter((c) => c.isActive !== false).map((c) => ({ value: c.id, label: label(c.label), hint: c.str1 || undefined }))} />
          <Field label={`${t('interviews.requirement')} (${t('interviews.optional')})`} maxLength={100} value={v.requirementRef} onChange={f('requirementRef')} />
        </div>
        {statusCode === 'CANCELLED' && <div className="field"><label htmlFor="iv-cancel">{t('interviews.cancelReason')}</label>
          <textarea id="iv-cancel" className="textarea" maxLength={2000} value={v.cancelReason} onChange={f('cancelReason')} /></div>}
      </div>}

      {tab === 'interviewers' && <div className="stack">
        <p className="muted">{stageCode === 'RS_TEAM' ? t('interviews.interviewersOptional') : t('interviews.interviewersRequired')}</p>
        {interviewers.map((x, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end' }} data-testid="interviewer-row">
            <div style={{ flex: 2, minWidth: 180 }}><Field label={t('interviews.fullName')} maxLength={150} value={x.name}
              onChange={(e) => setInterviewers(interviewers.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></div>
            <div style={{ flex: 2, minWidth: 180 }}><Field label={t('interviews.email')} type="email" value={x.email ?? ''}
              onChange={(e) => setInterviewers(interviewers.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))} /></div>
            {!isPhone && <label className="checkbox" style={{ height: 40 }}><input type="checkbox" checked={x.notify}
              onChange={(e) => setInterviewers(interviewers.map((y, j) => (j === i ? { ...y, notify: e.target.checked } : y)))} />{t('interviews.notify')}</label>}
            <button className="icon-ghost danger" onClick={() => setInterviewers(interviewers.filter((_, j) => j !== i))} aria-label={t('talents.delete')}><Icon name="trash" size={15} /></button>
          </div>
        ))}
        <div><Button variant="secondary" size="sm" onClick={() => setInterviewers([...interviewers, { name: '', email: '', notify: false }])} data-testid="add-interviewer">
          <Icon name="plus" size={14} />{t('interviews.addInterviewer')}</Button></div>
      </div>}

      {tab === 'questions' && <div className="stack">
        <p className="muted">{t('interviews.questionsHint')}</p>
        {cat.byTable('PHONE_QUESTION').map((q, i) => (
          <div key={q.id} className="field">
            <label htmlFor={`q-${q.id}`}>{i + 1}. {label(q.label)}</label>
            <textarea id={`q-${q.id}`} className="textarea" style={{ minHeight: 56 }} maxLength={5000} value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
          </div>
        ))}
      </div>}

      {tab === 'evaluation' && <div className="stack">
        <div className="field"><span>{t('interviews.ratingGeneral')}</span>
          <Stars value={v.ratingGeneral} onChange={(n) => setV({ ...v, ratingGeneral: n })} label={t('interviews.ratingGeneral')} /></div>
        {!isPhone && ([['Personal', 'personal'], ['Experience', 'experience'], ['Languages', 'languages'], ['Education', 'education']] as const).map(([k, key]) => (
          <div key={k} className="sub-form">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{t(`interviews.area.${key}`)}</strong>
              <Stars value={v[`rating${k}`]} onChange={(n) => setV({ ...v, [`rating${k}`]: n })} label={t(`interviews.area.${key}`)} />
            </div>
            <textarea className="textarea" style={{ minHeight: 56 }} maxLength={5000} aria-label={t(`interviews.area.${key}`)} value={v[`notes${k}`]}
              onChange={(e) => setV({ ...v, [`notes${k}`]: e.target.value })} />
          </div>
        ))}
      </div>}

      {tab === 'recordings' && <div className="stack">
        {recordings.map((r, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 3 }}><Field label={t('interviews.recordingUrl')} type="url" value={r.url} onChange={(e) => setRecordings(recordings.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} /></div>
            <div style={{ flex: 1 }}><Field label={t('interviews.date')} type="date" value={r.date} onChange={(e) => setRecordings(recordings.map((y, j) => (j === i ? { ...y, date: e.target.value } : y)))} /></div>
            <button className="icon-ghost danger" onClick={() => setRecordings(recordings.filter((_, j) => j !== i))} aria-label={t('talents.delete')}><Icon name="trash" size={15} /></button>
          </div>
        ))}
        <div><Button variant="secondary" size="sm" onClick={() => setRecordings([...recordings, { url: '', date: v.date }])}><Icon name="plus" size={14} />{t('interviews.addRecording')}</Button></div>
      </div>}
    </Modal>
  );
}

function TalentPicker({ onPick }: { onPick: (t: { id: string; name: string }) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<TalentSummary[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const h = window.setTimeout(() => {
      http.post<{ items: TalentSummary[] }>(`${TALENT_API}/search`, { search: q, pageSize: 8 }).then((r) => setFound(r.items)).catch(() => setFound([]));
    }, 400);
    return () => window.clearTimeout(h);
  }, [q]);
  return (
    <div className="field">
      <label htmlFor="iv-talent-q">{t('interviews.talent')}</label>
      <input id="iv-talent-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('talents.searchPlaceholder')} autoComplete="off" />
      {found.map((x) => <button key={x.id} type="button" className="link-btn" style={{ padding: '6px 0' }} onClick={() => onPick({ id: x.id, name: fullName(x) })}>
        {fullName(x)} <span className="muted">{x.headline ? `· ${x.headline}` : ''}</span></button>)}
    </div>
  );
}
