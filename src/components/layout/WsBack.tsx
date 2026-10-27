import { Link } from 'react-router';
import { Icon } from '../ui/Icon';

/** «Volver al listado»: solo visible en móvil, donde listado y detalle se muestran por turnos. */
export function WsBack({ to, label }: { to: string; label: string }) {
  return <Link className="ws-back" to={to} data-testid="ws-back"><Icon name="chevronLeft" size={16} />{label}</Link>;
}
