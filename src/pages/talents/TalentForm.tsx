import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, http } from '../../lib/api';
import { useAuth } from '../../providers/auth';
import { cachedGet, TALENT_API, useLabel, useMasters, type Rates, type Talent } from '../../lib/talents';
import { Button, Card, Field, useErrorText } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

interface Form {
  firstName: string; lastName: string; secondLastName: string; headline: string; docTypeId: string; docNumber: string;
  email: string; phone: string; countryId: string; city: string; linkedinUrl: string; githubUrl: string; summary: string;
  availability: string; hasEquipment: '' | 'yes' | 'no';
}
const EMPTY: Form = { firstName: '', lastName: '', secondLastName: '', headline: '', docTypeId: '', docNumber: '', email: '', phone: '',
  countryId: '', city: '', linkedinUrl: '', githubUrl: '', summary: '', availability: '', hasEquipment: '' };

const nz = (s: string) => (s.trim() === '' ? null : s.trim());
const num = (s: string | number | undefined) => (s === '' || s === undefined || s === null ? undefined : Number(s));

export function TalentForm() {
  const { tenant = '', id } = useParams();
  const editing = !!id;
  const { t } = useTranslation();
  const { can } = useAuth();
  const label = useLabel();
  const masters = useMasters();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const canRates = can('talent.rates.read');
  const [form, setForm] = useState<Form>(EMPTY);
  const [rates, setRates] = useState<Rates>({});
  const [version, setVersion] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const existing = useQuery({ queryKey: ['talent', id], enabled: editing, queryFn: () => cachedGet<Talent>(`${TALENT_API}/${id}`) });
  useEffect(() => {
    const x = existing.data;
    if (!x) return;
    setForm({
      firstName: x.firstName, lastName: x.lastName, secondLastName: x.secondLastName ?? '', headline: x.headline ?? '',
      docTypeId: x.docTypeId ?? '', docNumber: x.docNumber ?? '', email: x.email ?? '', phone: x.phone ?? '',
      countryId: x.countryId ?? '', city: x.city ?? '', linkedinUrl: x.linkedinUrl ?? '', githubUrl: x.githubUrl ?? '',
      summary: x.summary ?? '', availability: x.availability ?? '',
      hasEquipment: x.hasEquipment === undefined || x.hasEquipment === null ? '' : x.hasEquipment ? 'yes' : 'no',
    });
    setRates(x.rates ?? {});
    setVersion(x.version);
  }, [existing.data]);

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const r = (k: keyof Rates) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setRates({ ...rates, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const talentId = id ?? crypto.randomUUID();
    const body: Record<string, unknown> = {
      id: talentId, firstName: form.firstName.trim(), lastName: form.lastName.trim(), secondLastName: nz(form.secondLastName),
      headline: nz(form.headline), docTypeId: nz(form.docTypeId), docNumber: form.docNumber.trim(), email: form.email.trim(),
      phone: form.phone.trim(), countryId: nz(form.countryId), city: nz(form.city), linkedinUrl: nz(form.linkedinUrl),
      githubUrl: nz(form.githubUrl), summary: nz(form.summary), availability: nz(form.availability),
      hasEquipment: form.hasEquipment === '' ? null : form.hasEquipment === 'yes',
    };
    if (editing) body.expectedVersion = version;
    if (canRates) {
      body.rates = {
        modalityId: rates.modalityId || undefined, payrollMin: num(rates.payrollMin), payrollMax: num(rates.payrollMax),
        payrollCurrencyId: rates.payrollCurrencyId || undefined, rxhMin: num(rates.rxhMin), rxhMax: num(rates.rxhMax),
        rxhCurrencyId: rates.rxhCurrencyId || undefined, notes: rates.notes || undefined,
      };
    }
    try {
      if (editing) await http.put(`${TALENT_API}/${talentId}`, body, true);
      else await http.post(TALENT_API, body, true);
      toast.success(t('talents.saved'));
      qc.invalidateQueries({ queryKey: ['talents'] });
      qc.invalidateQueries({ queryKey: ['talent', talentId] });
      nav(`/${tenant}/talentos/${talentId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OFFLINE') {
        toast.info(t('talents.savedOffline'));
        nav(`/${tenant}/talentos`);
      } else {
        setError(errText(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const opts = (table: string) => masters.byTable(table).map((m) => <option key={m.id} value={m.id}>{label(m.label)}</option>);

  return (
    <form className="page" onSubmit={submit} noValidate>
      <div className="page-header">
        <div>
          <Link to={editing ? `/${tenant}/talentos/${id}` : `/${tenant}/talentos`} className="muted">← {t('talents.back')}</Link>
          <h1>{editing ? t('talents.edit') : t('talents.new')}</h1>
        </div>
        <Button type="submit" loading={busy} disabled={!form.firstName || !form.lastName} data-testid="save-talent">{t('common.save')}</Button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <Card title={t('talents.personal')}>
        <div className="form-grid">
          <Field label={t('talents.firstName')} required maxLength={100} value={form.firstName} onChange={f('firstName')} />
          <Field label={t('talents.lastName')} required maxLength={100} value={form.lastName} onChange={f('lastName')} />
          <Field label={t('talents.secondLastName')} maxLength={100} value={form.secondLastName} onChange={f('secondLastName')} />
          <div className="field"><label htmlFor="tf-doctype">{t('talents.docType')}</label>
            <select id="tf-doctype" className="select" value={form.docTypeId} onChange={f('docTypeId')}><option value="">—</option>{opts('DOC_IDENTITY_TYPE')}</select></div>
          <Field label={t('talents.docNumber')} maxLength={30} value={form.docNumber} onChange={f('docNumber')} />
          <div className="field"><label htmlFor="tf-country">{t('talents.country')}</label>
            <select id="tf-country" className="select" value={form.countryId} onChange={f('countryId')}><option value="">—</option>{opts('COUNTRY')}</select></div>
          <Field label={t('talents.city')} maxLength={120} value={form.city} onChange={f('city')} />
        </div>
      </Card>

      <Card title={t('talents.contact')}>
        <div className="form-grid">
          <Field label={t('talents.email')} type="email" maxLength={254} value={form.email} onChange={f('email')} />
          <Field label={t('talents.phone')} type="tel" maxLength={30} value={form.phone} onChange={f('phone')} />
          <Field label={t('talents.linkedin')} type="url" placeholder="https://www.linkedin.com/in/..." value={form.linkedinUrl} onChange={f('linkedinUrl')} />
          <Field label={t('talents.github')} type="url" placeholder="https://github.com/..." value={form.githubUrl} onChange={f('githubUrl')} />
        </div>
      </Card>

      <Card title={t('talents.profile')}>
        <div className="stack">
          <div className="form-grid">
            <Field label={t('talents.headline')} maxLength={150} value={form.headline} onChange={f('headline')} />
            <Field label={t('talents.availability')} maxLength={150} value={form.availability} onChange={f('availability')} />
            <div className="field"><label htmlFor="tf-eq">{t('talents.hasEquipment')}</label>
              <select id="tf-eq" className="select" value={form.hasEquipment} onChange={f('hasEquipment')}>
                <option value="">—</option><option value="yes">{t('talents.yes')}</option><option value="no">{t('talents.no')}</option>
              </select></div>
          </div>
          <div className="field"><label htmlFor="tf-summary">{t('talents.summary')}</label>
            <textarea id="tf-summary" className="textarea" maxLength={5000} value={form.summary} onChange={f('summary')} /></div>
        </div>
      </Card>

      {canRates && (
        <Card title={t('talents.rates')}>
          <div className="form-grid">
            <div className="field"><label htmlFor="tf-mod">{t('talents.modality')}</label>
              <select id="tf-mod" className="select" value={rates.modalityId ?? ''} onChange={r('modalityId')}><option value="">—</option>{opts('BILLING_MODALITY')}</select></div>
            <Field label={`${t('talents.payroll')} · ${t('talents.min')}`} type="number" min={0} value={rates.payrollMin ?? ''} onChange={r('payrollMin')} />
            <Field label={`${t('talents.payroll')} · ${t('talents.max')}`} type="number" min={0} value={rates.payrollMax ?? ''} onChange={r('payrollMax')} />
            <div className="field"><label htmlFor="tf-pcur">{`${t('talents.payroll')} · ${t('talents.currency')}`}</label>
              <select id="tf-pcur" className="select" value={rates.payrollCurrencyId ?? ''} onChange={r('payrollCurrencyId')}><option value="">—</option>{opts('CURRENCY')}</select></div>
            <Field label={`${t('talents.rxh')} · ${t('talents.min')}`} type="number" min={0} value={rates.rxhMin ?? ''} onChange={r('rxhMin')} />
            <Field label={`${t('talents.rxh')} · ${t('talents.max')}`} type="number" min={0} value={rates.rxhMax ?? ''} onChange={r('rxhMax')} />
            <div className="field"><label htmlFor="tf-rcur">{`${t('talents.rxh')} · ${t('talents.currency')}`}</label>
              <select id="tf-rcur" className="select" value={rates.rxhCurrencyId ?? ''} onChange={r('rxhCurrencyId')}><option value="">—</option>{opts('CURRENCY')}</select></div>
            <Field label={t('talents.notes')} maxLength={300} value={rates.notes ?? ''} onChange={r('notes')} />
          </div>
        </Card>
      )}
    </form>
  );
}
