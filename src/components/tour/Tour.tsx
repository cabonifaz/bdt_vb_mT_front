// Guías de primer uso: la primera vez que el usuario entra a una pantalla se muestra su guía paso a paso,
// resaltando cada parte (los pasos sin elemento en pantalla se omiten). El botón "?" la vuelve a abrir.
// Lo visto se guarda en el servidor (sirve en cualquier dispositivo). No se abre sola en navegadores automatizados.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleHelp, X } from 'lucide-react';
import { getTours, markTourSeen } from '../../lib/support';
import { useAuth } from '../../providers/auth';
import { TOURS, tourForPath, type TourStep } from './tours';

const OPEN_EVENT = 'bdt:tour';
/** Abre la guía indicada (o la de la pantalla actual). */
export const openTour = (key?: string) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: key }));

export function HelpButton() {
  const { t } = useTranslation();
  return (
    <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={() => openTour()} aria-label={t('tour.help')} title={t('tour.help')} data-testid="help-button">
      <CircleHelp size={18} />
    </button>
  );
}

const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0;

const MARGIN = 16;
const GAP = 14;
type Box = { top: number; left: number; right: number; bottom: number; width: number; height: number };

/** La parte del elemento que está en pantalla (un tablero alto puede salirse por arriba o por abajo). */
function visiblePart(r: DOMRect): Box {
  const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
  const left = Math.max(r.left, 0), right = Math.min(r.right, window.innerWidth);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Ubica la tarjeta (w×h) junto al elemento sin taparlo ni salirse de la pantalla. */
function place(r: Box, w: number, h: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
  const x = clamp(r.left, MARGIN, vw - w - MARGIN);
  const y = clamp(r.top, MARGIN, vh - h - MARGIN);
  if (r.bottom + GAP + h <= vh - MARGIN) return { top: r.bottom + GAP, left: x };
  if (r.top - GAP - h >= MARGIN) return { top: r.top - GAP - h, left: x };
  if (r.right + GAP + w <= vw - MARGIN) return { top: y, left: r.right + GAP };
  if (r.left - GAP - w >= MARGIN) return { top: y, left: r.left - GAP - w };
  // el elemento ocupa casi toda la pantalla (p. ej. el tablero): la tarjeta va en la esquina inferior derecha
  return { top: Math.max(MARGIN, vh - h - MARGIN), left: Math.max(MARGIN, vw - w - MARGIN) };
}

export function TourHost({ platform }: { platform: boolean }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const seen = useQuery({ queryKey: ['tours'], queryFn: getTours, enabled: !!user, staleTime: Infinity });
  const [active, setActive] = useState<{ key: string; steps: TourStep[] } | null>(null);
  const key = tourForPath(pathname, platform);

  // pasos con su elemento visible (los que no aplican a la pantalla o al rol se omiten)
  const resolve = useCallback((k: string) => TOURS[k]?.steps.filter((st) => !st.target || visible(document.querySelector(st.target))) ?? [], []);

  // primera visita: se espera a que la pantalla cargue (aparece el primer elemento de la guía) y se muestra
  useEffect(() => {
    if (!key || !seen.data || active || navigator.webdriver) return;
    const tour = TOURS[key];
    if (!tour || (seen.data[key] ?? 0) >= tour.version) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      const first = tour.steps.find((st) => st.target);
      if (tries > 20 || !first || visible(document.querySelector(first.target!))) {
        window.clearInterval(timer);
        if (document.querySelector('[role="dialog"]')) return; // no encima de un modal abierto
        const steps = resolve(key);
        if (steps.length) setActive({ key, steps });
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, [key, seen.data, active, resolve]);

  useEffect(() => {
    // si la pantalla aún carga, se espera un poco a que aparezcan sus elementos (hasta ~3 s)
    let timer = 0;
    const onOpen = (e: Event) => {
      const k = (e as CustomEvent<string | undefined>).detail ?? key;
      if (!k || !TOURS[k]) return;
      const all = TOURS[k].steps.length;
      let tries = 0;
      window.clearInterval(timer);
      const tryOpen = () => {
        const steps = resolve(k);
        if (steps.length === all || ++tries >= 10) {
          window.clearInterval(timer);
          if (steps.length) setActive({ key: k, steps });
        }
      };
      timer = window.setInterval(tryOpen, 300);
      tryOpen();
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener(OPEN_EVENT, onOpen); window.clearInterval(timer); };
  }, [key, resolve]);

  // al cambiar de pantalla se cierra la guía en curso
  useEffect(() => { setActive(null); }, [pathname]);

  const finish = () => {
    if (!active) return;
    const version = TOURS[active.key].version;
    qc.setQueryData<Record<string, number>>(['tours'], (cur) => ({ ...(cur ?? {}), [active.key]: version }));
    void markTourSeen(active.key, version).catch(() => undefined);
    setActive(null);
  };
  return active ? <TourOverlay steps={active.steps} onClose={finish} /> : null;
}

function TourOverlay({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  useLayoutEffect(() => {
    const el = step.target ? document.querySelector(step.target) : null;
    if (!visible(el)) { setRect(null); return; }
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step]);

  useEffect(() => { card.current?.focus(); }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && !last) setI((x) => x + 1);
      else if (e.key === 'ArrowLeft' && i > 0) setI((x) => x - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [i, last, onClose]);

  // la tarjeta se mide y se ubica junto al elemento donde quepa entera (debajo, encima, derecha, izquierda);
  // sin elemento, centrada; en móvil, abajo
  const anchored = !!rect && window.innerWidth > 640;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const c = card.current;
    setPos(anchored && rect && c ? place(visiblePart(rect), c.offsetWidth, c.offsetHeight) : null);
  }, [anchored, rect, i]);

  const pad = 8;
  const spot = rect && visiblePart(rect);
  const style: React.CSSProperties = anchored ? (pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }) : {};
  return (
    <div className="tour-layer" data-testid="tour">
      {spot
        ? <div className="tour-spot" style={{ top: spot.top - pad, left: spot.left - pad, width: spot.width + pad * 2, height: spot.height + pad * 2 }} />
        : <div className="tour-dim" />}
      <div ref={card} className={`tour-card${anchored ? ' anchored' : ''}`} style={style} role="dialog" aria-modal="true"
        aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1}>
        <button type="button" className="icon-ghost tour-close" onClick={onClose} aria-label={t('tour.skip')}><X size={16} /></button>
        <div className="tour-progress">{t('tour.step', { n: i + 1, total: steps.length })}</div>
        <h3 id="tour-title">{step.title[lang]}</h3>
        <p id="tour-body">{step.body[lang]}</p>
        {step.example && <div className="tour-example"><strong>{t('tour.example')}</strong> {step.example[lang].replace(/^(Ej.:|E.g.)s*/, '')}</div>}
        <div className="tour-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-testid="tour-skip">{t('tour.skip')}</button>
          <span className="spacer" />
          {i > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setI(i - 1)}>{t('tour.prev')}</button>}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? onClose() : setI(i + 1))} data-testid="tour-next">{last ? t('tour.done') : t('tour.next')}</button>
        </div>
        <div className="tour-dots" aria-hidden>{steps.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
      </div>
    </div>
  );
}
