import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { assetUrl, lastBrand, useTheme } from '../../providers/theme';

/**
 * Pantalla de carga con el logo del tenant (pulso + barra indeterminada con sus colores).
 * - screen: ocupa toda la pantalla (restaurar sesión, carga diferida de rutas).
 * - panel: llena su contenedor (listados y fichas que cargan datos).
 * - overlay: cubre la app durante procesos largos (guardar con varias secciones, subir archivos).
 * `delay` evita el parpadeo en cargas rápidas: solo aparece si la espera supera ese tiempo.
 */
export function Loader({ variant = 'panel', label, delay = variant === 'overlay' ? 250 : 150 }: {
  variant?: 'screen' | 'panel' | 'overlay'; label?: string; delay?: number;
}) {
  const { t } = useTranslation();
  const { branding } = useTheme();
  const [visible, setVisible] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const h = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(h);
  }, [delay]);

  // el último branding conocido se lee de forma síncrona: el logo aparece incluso antes de cargar el tema
  const brand = branding ?? lastBrand();
  const logo = brand ? assetUrl(brand.logoUrl) : '';
  const name = brand?.displayName ?? 'Banco de Talentos';
  const text = label ?? t('common.loading');

  return (
    <div className={`loader loader-${variant}${visible ? '' : ' loader-wait'}`}
      style={brand ? { '--loader-a': brand.colorPrimary, '--loader-b': brand.colorSecondary } as CSSProperties : undefined} role="status" aria-live="polite" aria-busy="true" data-testid="loader">
      <div className="loader-box">
        {logo
          ? <img className="loader-logo" src={logo} alt={name} />
          : <div className="loader-mark" aria-hidden>{name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>}
        <div className="loader-bar" aria-hidden><span /></div>
        <span className="loader-label">{text}</span>
      </div>
    </div>
  );
}
