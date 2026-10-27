import { useTranslation } from 'react-i18next';
import { completeness, type ProfileFacts } from '../../lib/completeness';

/** Barra de perfil completo. En la ficha, al hacer clic abre el editor; el detalle de lo que falta va en el title. */
export function ProfileMeter({ facts, onClick, inline }: { facts: ProfileFacts; onClick?: () => void; inline?: boolean }) {
  const { t } = useTranslation();
  const { pct, missing } = completeness(facts);
  const tone = pct >= 80 ? 'ok' : pct >= 50 ? 'mid' : 'low';
  const hint = missing.length ? `${t('talents.cp.missing')}: ${missing.map((k) => t(`talents.cp.${k}`)).join(', ')}` : t('talents.cp.done');
  const body = (
    <>
      <span className="pm-label">{t('talents.cp.title')}</span>
      <span className="pm-track" aria-hidden><span style={{ width: `${pct}%` }} /></span>
      <span className="pm-pct">{pct}%</span>
    </>
  );
  const cls = `pm pm-${tone}${inline ? ' pm-inline' : ''}`;
  if (onClick) {
    return <button type="button" className={cls} title={hint} data-testid="profile-meter" data-pct={pct}
      aria-label={`${t('talents.cp.title')} ${pct}%. ${hint}`} onClick={onClick}>{body}</button>;
  }
  return (
    <div className={cls} title={hint} data-testid="profile-meter" data-pct={pct}
      role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('talents.cp.title')}>
      {body}
      {!inline && <span className="pm-missing">{hint}</span>}
    </div>
  );
}
