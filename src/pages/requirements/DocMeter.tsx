// Resumen visual de documentos en la tarjeta del postulante: un segmento por documento obligatorio
// (verde verificado, ámbar pendiente de revisar, rojo rechazado o vencido, gris faltante) y el conteo.
// Los opcionales no suman al conteo. Un clic abre la ficha del postulante en la pestaña de documentos.
import { useTranslation } from 'react-i18next';
import { FileCheck2 } from 'lucide-react';
import { useLabel } from '../../lib/talents';
import { byOrder, docSummary, type CandidateDocState, type RQDocument } from '../../lib/documents';

export function DocMeter({ docs, labels, onOpen }: { docs: CandidateDocState[]; labels: RQDocument[]; onOpen: () => void }) {
  const { t } = useTranslation();
  const label = useLabel();
  const s = docSummary(docs);
  const meta = (id: string) => labels.find((l) => l.typeId === id);
  const ordered = [...docs].sort((a, b) => byOrder({ sortOrder: meta(a.typeId)?.sortOrder ?? 0 }, { sortOrder: meta(b.typeId)?.sortOrder ?? 0 }));
  const required = ordered.filter((d) => d.mode === 'REQUIRED');
  // detalle accesible: cada documento con su estado
  const detail = ordered.map((d) => `${label(meta(d.typeId)?.label)}${d.mode === 'OPTIONAL' ? ` (${t('docs.usageOpt.OPTIONAL').toLowerCase()})` : ''}: ${t(`docs.status.${d.status}`)}`).join('\n');
  const tone = s.total === 0 ? 'none' : s.problems > 0 ? 'bad' : s.verified === s.total ? 'ok' : s.pending > 0 ? 'review' : 'missing';
  return (
    <button type="button" className={`doc-meter tone-${tone}`} onClick={onOpen} title={detail} aria-label={`${t('docs.meterLabel', { done: s.verified, total: s.total })}. ${detail}`}
      data-testid="doc-meter">
      <FileCheck2 size={13} aria-hidden />
      {required.length > 0 && (
        <span className="doc-meter-bar" aria-hidden>
          {required.map((d) => <span key={d.typeId} className={`seg seg-${d.status.toLowerCase()}`} />)}
        </span>
      )}
      <span className="doc-meter-count">{s.total > 0 ? `${s.verified}/${s.total}` : t('docs.optionalOnly')}</span>
    </button>
  );
}
