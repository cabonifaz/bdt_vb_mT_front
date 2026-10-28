// Logo del tenant; si no tiene logo o la imagen no carga, muestra su nombre (nunca una imagen rota).
import { useState } from 'react';
import { assetUrl } from '../../providers/theme';

export function BrandLogo({ logoUrl, name, className, testId }: { logoUrl?: string; name: string; className?: string; testId?: string }) {
  const [broken, setBroken] = useState(false);
  if (!logoUrl || broken) return <strong className={`brand-text${className ? ` ${className}` : ''}`} data-testid={testId}>{name}</strong>;
  return <img className={className} src={assetUrl(logoUrl)} alt={name} onError={() => setBroken(true)} data-testid={testId} />;
}
