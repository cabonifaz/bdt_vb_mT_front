import { createContext, useContext, useState, type ReactNode } from 'react';
import { EMPTY_FILTERS, type TalentFilters } from '../lib/talents';

// Filtros del módulo de talentos: solo en memoria (no en la URL ni en almacenamiento).
// Sobreviven al cambiar de talento o de módulo y se descartan al cerrar sesión
// (el proveedor vive dentro del área autenticada del tenant).
interface Ctx { filters: TalentFilters; setFilters: (f: TalentFilters) => void }
const FiltersCtx = createContext<Ctx>({ filters: EMPTY_FILTERS, setFilters: () => {} });

export function TalentFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<TalentFilters>(EMPTY_FILTERS);
  return <FiltersCtx.Provider value={{ filters, setFilters }}>{children}</FiltersCtx.Provider>;
}

export const useTalentFilters = () => useContext(FiltersCtx);
