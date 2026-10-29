// Maestro de documentos de postulación del tenant: qué se pide por defecto en los RQ, si se reutiliza entre RQ,
// cuánto dura y cómo se valida (manual o, para el CUL, automática contra el MTPE con el RUC de la empresa).
// Cada RQ parte de este maestro y puede ajustarlo en su pestaña "Documentos".
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../../lib/api';
import { cachedGet, useLabel, type MasterItem } from '../../lib/talents';
import { DOC_RULES_API, useDocRules, type DocRule, type DocMode, type DocVerification } from '../../lib/documents';
import { Button, Card, Field, Modal, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { Loader } from '../../components/ui/Loader';

type Item = MasterItem & { isActive?: boolean };
type Usage = DocMode | 'NONE';

export function DocumentRules() {
  const { t } = useTranslation();
  const label = useLabel();
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['doc-types'], queryFn: () => cachedGet<Item[]>('/api/v1/masters/items?tables=DOCUMENT_TYPE') });
  const rules = useDocRules();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const ruleOf = (id: string) => rules.data?.find((r) => r.typeId === id);
  // primero los que se usan (en su orden), luego el resto del catálogo
  const rows = [...(types.data ?? [])].sort((a, b) => {
    const ra = ruleOf(a.id), rb = ruleOf(b.id);
    const ua = ra?.active ? 0 : 1, ub = rb?.active ? 0 : 1;
    return ua - ub || (ra?.sortOrder ?? 0) - (rb?.sortOrder ?? 0) || a.sortOrder - b.sortOrder;
  });
  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('docs.title')}</h1><p className="muted">{t('docs.subtitle')}</p></div>
        <Button onClick={() => setEditing('new')} data-testid="doc-type-new"><Icon name="plus" size={16} />{t('docs.newType')}</Button>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="table" data-testid="doc-rules">
            <thead><tr><th>{t('docs.document')}</th><th>{t('docs.usage')}</th><th>{t('docs.reuse')}</th><th>{t('docs.validity')}</th><th>{t('docs.verification')}</th><th></th></tr></thead>
            <tbody>
              {rows.map((d) => {
                const r = ruleOf(d.id);
                const usage: Usage = r?.active ? r.defaultMode : 'NONE';
                return (
                  <tr key={d.id} data-testid="doc-rule-row" className={usage === 'NONE' ? 'row-muted' : ''}>
                    <td><strong>{label(d.label)}</strong></td>
                    <td><span className={`badge doc-usage-${usage.toLowerCase()}`}>{t(`docs.usageOpt.${usage}`)}</span></td>
                    <td>{r && usage !== 'NONE' ? t(r.reusable ? 'docs.reusable' : 'docs.perApplication') : '—'}</td>
                    <td>{r?.validityDays ? t('docs.days', { count: r.validityDays }) : '—'}</td>
                    <td>{r && usage !== 'NONE' ? t(`docs.verif.${r.verification}`) : '—'}</td>
                    <td><button className="icon-ghost" onClick={() => setEditing(d)} aria-label={t('docs.editRule', { name: label(d.label) })}><Icon name="edit" size={15} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(types.isLoading || rules.isLoading) && <Loader />}
        </div>
      </Card>
      {editing && <RuleModal type={editing === 'new' ? null : editing} rule={editing === 'new' ? undefined : ruleOf(editing.id)}
        nextOrder={(rules.data?.length ?? 0) + 1} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ['doc-rules'] }); void qc.invalidateQueries({ queryKey: ['doc-types'] }); void qc.invalidateQueries({ queryKey: ['masters'] }); }} />}
    </div>
  );
}

function RuleModal({ type, rule, nextOrder, onClose, onSaved }: { type: Item | null; rule?: DocRule; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const toast = useToast();
  const errText = useErrorText();
  const isCul = type?.code === 'CUL';
  const [v, setV] = useState({
    name: type ? label(type.label) : '', usage: (rule?.active ? rule.defaultMode : rule ? 'NONE' : 'REQUIRED') as Usage,
    reusable: rule?.reusable ?? true, validity: rule?.validityDays ? String(rule.validityDays) : (isCul ? '90' : ''),
    verification: (rule?.verification ?? (isCul ? 'AUTO_CUL' : 'MANUAL')) as DocVerification,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validity = v.validity.trim() === '' ? null : Number(v.validity);
  const invalid = (!type && !v.name.trim()) || (validity !== null && (!Number.isInteger(validity) || validity < 1 || validity > 3650));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      let typeId = type?.id;
      if (!type) {
        // tipo propio del tenant
        typeId = crypto.randomUUID();
        const code = `DOC-${v.name.toUpperCase().normalize('NFD').replace(/[^A-Z0-9]+/g, '-').slice(0, 40)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await http.put('/api/v1/tenant/masters/items', { table: 'DOCUMENT_TYPE', id: typeId, code, label: { es: v.name.trim(), en: v.name.trim() }, isActive: true });
      }
      await http.put(`${DOC_RULES_API}/${typeId}`, {
        defaultMode: v.usage === 'NONE' ? (rule?.defaultMode ?? 'OPTIONAL') : v.usage, active: v.usage !== 'NONE',
        reusable: v.reusable, validityDays: validity, verification: v.verification, sortOrder: rule?.sortOrder ?? nextOrder,
      });
      toast.success(t('docs.saved'));
      onSaved();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={type ? label(type.label) : t('docs.newType')} onClose={onClose} footer={<>
      <span className="spacer" />
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={busy} disabled={invalid} onClick={save} data-testid="doc-rule-save">{t('common.save')}</Button></>}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {!type && <Field label={t('docs.typeName')} required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={t('docs.typeNamePlaceholder')} />}
      <fieldset className="choice-group">
        <legend>{t('docs.usage')}</legend>
        {(['REQUIRED', 'OPTIONAL', 'NONE'] as Usage[]).map((u) => (
          <label key={u} className="checkbox"><input type="radio" name="doc-usage" checked={v.usage === u} onChange={() => setV({ ...v, usage: u })} data-testid={`doc-usage-${u}`} />
            <span>{t(`docs.usageOpt.${u}`)} <span className="muted">· {t(`docs.usageHint.${u}`)}</span></span></label>
        ))}
      </fieldset>
      {v.usage !== 'NONE' && <>
        <label className="checkbox"><input type="checkbox" checked={v.reusable} onChange={(e) => setV({ ...v, reusable: e.target.checked })} data-testid="doc-reusable" />
          <span>{t('docs.reusableLabel')} <span className="muted">· {t('docs.reusableHint')}</span></span></label>
        <Field label={t('docs.validityLabel')} type="number" min={1} max={3650} value={v.validity} onChange={(e) => setV({ ...v, validity: e.target.value })}
          hint={t('docs.validityHint')} data-testid="doc-validity" />
        <div className="field">
          <label htmlFor="doc-verif">{t('docs.verification')}</label>
          <select id="doc-verif" className="select" value={v.verification} onChange={(e) => setV({ ...v, verification: e.target.value as DocVerification })} data-testid="doc-verification">
            <option value="MANUAL">{t('docs.verif.MANUAL')}</option>
            {isCul && <option value="AUTO_CUL">{t('docs.verif.AUTO_CUL')}</option>}
          </select>
          {v.verification === 'AUTO_CUL' && <span className="hint">{t('docs.autoCulHint')}</span>}
        </div>
      </>}
    </Modal>
  );
}
