// Barras verticales en SVG (sin librerías): una o dos series con la misma unidad, eje Y con 3 marcas, etiqueta del
// valor al pasar el mouse o enfocar la barra, y la tabla equivalente para lectores de pantalla.
import { useEffect, useRef, useState } from 'react';

export type BarSeries = { key: string; label: string; color: string };
type Props<T> = {
  data: T[]; series: BarSeries[]; x: (d: T) => string; xLabel: (d: T) => string; value: (d: T, key: string) => number;
  height?: number; ariaLabel: string; testId?: string;
};

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function BarChart<T>({ data, series, x, xLabel, value, height = 180, ariaLabel, testId }: Props<T>) {
  const [hover, setHover] = useState<number | null>(null);
  // ancho real del contenedor (el texto no se deforma); con muchos períodos se desplaza en horizontal
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(width, data.length * (series.length * 8 + 10) + 42);
  const pad = { l: 34, r: 8, t: 14, b: 28 };
  const max = niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => value(d, s.key)))));
  const ih = height - pad.t - pad.b;
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(22, (slot - 6) / series.length - 2));
  const rr = Math.min(3, bw / 2); // extremo redondeado de la barra
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const every = Math.ceil(data.length / 12); // etiquetas del eje X sin amontonarse
  return (
    <div className="chart" data-testid={testId}>
      <div className="chart-scroll" ref={box}>
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart-grid" />
            <text x={pad.l - 6} y={y(max * f) + 4} className="chart-tick" textAnchor="end">{Math.round(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const x0 = cx - (series.length * (bw + 2)) / 2;
          return (
            <g key={x(d)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              tabIndex={0} aria-label={`${xLabel(d)}: ${series.map((s) => `${s.label} ${value(d, s.key)}`).join(', ')}`}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={ih} className={`chart-hit${hover === i ? ' on' : ''}`} />
              {series.map((s, k) => {
                const v = value(d, s.key);
                const top = y(v);
                return v > 0 ? <path key={s.key} fill={s.color}
                  d={`M${x0 + k * (bw + 2)},${pad.t + ih} V${top + rr} q0,-${rr} ${rr},-${rr} h${bw - 2 * rr} q${rr},0 ${rr},${rr} V${pad.t + ih} Z`} /> : null;
              })}
              {i % every === 0 && <text x={cx} y={height - 8} className="chart-tick" textAnchor="middle">{xLabel(d)}</text>}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="chart-axis" />
      </svg>
      </div>
      {hover !== null && data[hover] && (
        <div className="chart-tip" role="status">
          <strong>{xLabel(data[hover])}</strong>
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}: {value(data[hover], s.key)}</span>)}
        </div>
      )}
      {series.length > 1 && (
        <div className="chart-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>
      )}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>{data.map((d) => <tr key={x(d)}><th>{xLabel(d)}</th>{series.map((s) => <td key={s.key}>{s.label}: {value(d, s.key)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
