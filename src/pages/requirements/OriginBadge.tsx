// Distintivo del candidato que IGDT trajo a este RQ por cambio de RQ (y, si IGDT registró el cese, del fin de contrato).
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, UserX } from 'lucide-react';
import { dayLabel } from '../../lib/documents';
import type { IGDTOrigin } from '../../lib/requirements';

export function OriginBadge({ origin }: { origin: IGDTOrigin }) {
  const { t, i18n } = useTranslation();
  const text = origin.fromCode ? t('rq.cand.fromIgdt', { code: origin.fromCode }) : t('rq.cand.fromIgdtNoCode');
  const tip = origin.date ? `${text} · ${dayLabel(origin.date, i18n.language)}` : text;
  return <span className="badge badge-info" title={tip} data-testid="cand-origin"><ArrowRightLeft size={12} aria-hidden />{text}</span>;
}

export function EndedBadge({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  return <span className="badge badge-neutral" data-testid="cand-ended"><UserX size={12} aria-hidden />{t('rq.cand.ended', { date: dayLabel(date, i18n.language) })}</span>;
}
