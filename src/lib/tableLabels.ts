// En móvil las tablas se muestran como tarjetas (ver base.css): cada celda necesita el título de su columna.
// Se rellena data-label desde el <thead> de forma genérica para todas las tablas .table.
function label(table: HTMLTableElement) {
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
  table.querySelectorAll('tbody tr').forEach((tr) => {
    [...tr.children].forEach((td, i) => {
      if (td.getAttribute('data-label') !== (heads[i] ?? '')) td.setAttribute('data-label', heads[i] ?? '');
    });
  });
}

export function startTableLabels() {
  let queued = false;
  const run = () => { queued = false; document.querySelectorAll<HTMLTableElement>('table.table').forEach(label); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}
