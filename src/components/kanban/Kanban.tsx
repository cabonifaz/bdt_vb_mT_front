// Tablero Kanban genérico (requerimientos por estado y candidatos por etapa).
// Arrastrar con mouse, toque (mantener pulsado) o teclado (espacio para tomar, flechas, espacio para soltar).
// Cada tarjeta debe ofrecer además un menú "Mover a…" (accesible y cómodo en móvil); el tablero no lo impone.
// Los enlaces dentro de la tarjeta llevan draggable={false}: un clic abre, mantener y mover arrastra la tarjeta.
import { useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';

export type KanbanColumn = { id: string; title: ReactNode; count?: number; tone?: string; hint?: ReactNode; footer?: ReactNode };

export function Kanban<T extends { id: string }>({ columns, items, columnOf, renderCard, onMove, canDrag = true, empty, testId, ariaLabel }: {
  columns: KanbanColumn[];
  items: T[];
  columnOf: (item: T) => string;
  renderCard: (item: T, dragging: boolean) => ReactNode;
  onMove: (item: T, toColumn: string) => void;
  canDrag?: boolean | ((item: T) => boolean);
  empty?: ReactNode;
  testId?: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState<T | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    // teclado: espacio toma y suelta, Esc cancela (Enter queda libre para abrir enlaces de la tarjeta)
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );
  const draggable = (x: T) => (typeof canDrag === 'function' ? canDrag(x) : canDrag);
  const start = (e: DragStartEvent) => setActive(items.find((x) => x.id === e.active.id) ?? null);
  const end = (e: DragEndEvent) => {
    setActive(null);
    const item = items.find((x) => x.id === e.active.id);
    const to = e.over?.id ? String(e.over.id) : null;
    if (item && to && to !== columnOf(item)) onMove(item, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={start} onDragEnd={end} onDragCancel={() => setActive(null)}>
      <div className="kanban" role="list" aria-label={ariaLabel} data-testid={testId}>
        {columns.map((c) => {
          const list = items.filter((x) => columnOf(x) === c.id);
          return (
            <Column key={c.id} col={c} count={c.count ?? list.length}>
              {list.length === 0 ? <p className="kanban-empty">{empty}</p> : list.map((x) => (
                <Card key={x.id} id={x.id} disabled={!draggable(x)}>{renderCard(x, active?.id === x.id)}</Card>
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <div className="kanban-card dragging">{renderCard(active, true)}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ col, count, children }: { col: KanbanColumn; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section ref={setNodeRef} className={`kanban-col${isOver ? ' over' : ''}${col.tone ? ` tone-${col.tone}` : ''}`} role="listitem"
      aria-label={typeof col.title === 'string' ? col.title : undefined} data-testid={`col-${col.id}`}>
      <header className="kanban-col-head">
        <span className="kanban-col-title">{col.title}</span>
        <span className="kanban-count">{count}</span>
      </header>
      {col.hint && <div className="kanban-col-hint">{col.hint}</div>}
      <div className="kanban-col-body">{children}</div>
      {col.footer}
    </section>
  );
}

function Card({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  // sin permiso para mover, la tarjeta no es un "botón deshabilitado": sus enlaces deben seguir siendo accesibles
  const drag = disabled ? {} : { ...attributes, ...listeners };
  return (
    <div ref={setNodeRef} className={`kanban-card${isDragging ? ' placeholder' : ''}${disabled ? ' locked' : ''}`} {...drag}
      data-testid="kanban-card" data-card-id={id}>
      {children}
    </div>
  );
}

/** Envuelve controles dentro de una tarjeta (menús, botones) para que no inicien el arrastre. */
export function NoDrag({ children, className }: { children: ReactNode; className?: string }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return <div className={className} onPointerDown={stop} onKeyDown={stop} onTouchStart={stop}>{children}</div>;
}

/** Menú "Mover a…" de una tarjeta: alternativa al arrastre (teclado, lectores de pantalla y móvil). */
export function MoveMenu({ label, options, current, onPick, testId }: {
  label: string; options: { id: string; label: string }[]; current: string; onPick: (id: string) => void; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <NoDrag className="move-menu">
      <button type="button" className="icon-ghost" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        onClick={() => setOpen((o) => !o)} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false); }}
        data-testid={testId}>⋯</button>
      {open && (
        <div className="move-pop" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <span className="move-title">{label}</span>
          {options.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={o.id === current} disabled={o.id === current}
              onClick={() => { setOpen(false); onPick(o.id); }} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </NoDrag>
  );
}
