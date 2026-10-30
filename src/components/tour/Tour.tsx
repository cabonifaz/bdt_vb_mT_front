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

  // la tarjeta va debajo del elemento si cabe; si no, encima; sin elemento, centrada (en móvil, abajo)
  const pad = 8;
  const style: React.CSSProperties = {};
  if (rect && window.innerWidth > 640) {
    const below = rect.bottom + pad + 220 < window.innerHeight;
    style.top = below ? rect.bottom + pad + 6 : undefined;
    style.bottom = below ? undefined : window.innerHeight - rect.top + pad + 6;
    style.left = Math.min(Math.max(16, rect.left), window.innerWidth - 376);
  }
  return (
    <div className="tour-layer" data-testid="tour">
      {rect
        ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
        : <div className="tour-dim" />}
      <div ref={card} className={`tour-card${rect && window.innerWidth > 640 ? ' anchored' : ''}`} style={style} role="dialog" aria-modal="true"
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
