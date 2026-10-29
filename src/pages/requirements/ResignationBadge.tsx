// Distintivo de un candidato que renunció tras confirmarse (en el pipeline del RQ y en las postulaciones del talento).
import { useTranslation } from 'react-i18next';
import { UserX } from 'lucide-react';
import { formatDate } from '../../components/ui';
import type { RQResignation } from '../../lib/requirements';

/** Renunció tras confirmarse: ya no cubre la vacante. La baja la confirma el FMI (pendiente → efectiva). */
export function ResignationBadge({ r }: { r: RQResignation }) {
  const { t, i18n } = useTranslation();
  const effective = r.offboard === 'EFFECTIVE';
  const tip = t(effective ? 'rq.resign.tipEffective' : 'rq.resign.tipPending', {
    date: formatDate(r.at, i18n.language), offboard: r.offboardAt ? formatDate(r.offboardAt, i18n.language) : '',
  });
  return (
    <span className={`badge rq-resigned${effective ? ' effective' : ''}`} title={tip} data-testid="cand-resigned">
      <UserX size={12} aria-hidden />{t('rq.resign.label')} · {t(effective ? 'rq.resign.effective' : 'rq.resign.pending')}
    </span>
  );
}
