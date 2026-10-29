import { test, expect, type Locator, type Page } from '@playwright/test';
import { apiLogin, createFractalAdmin, pickOption, uiLoginOk as uiLogin } from './helpers';

// flujos largos contra la BD remota de staging: más margen que el límite por defecto
test.describe.configure({ timeout: 180_000 });

// Arrastra una tarjeta del Kanban hasta una columna (mouse real: el tablero usa dnd-kit con umbral de 6 px).
async function drag(page: Page, card: Locator, column: Locator) {
  await card.scrollIntoViewIfNeeded();
  const a = (await card.boundingBox())!;
  const b = (await column.boundingBox())!;
  // se toma por el texto principal (también sirve el nombre o título, que son enlaces)
  await page.mouse.move(a.x + a.width / 2, a.y + 14);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + 22, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
  await page.mouse.up();
}
const column = (page: Page, board: string, title: string) =>
  page.getByTestId(board).locator('.kanban-col').filter({ has: page.locator('.kanban-col-title', { hasText: new RegExp(`^${title}$`) }) });

type Masters = { id: string; table: string; code: string }[];
async function setup() {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const m = await (await admin.ctx.get('/api/v1/masters/items?tables=RQ_STATUS,RQ_PROFILE,CANDIDATE_STAGE', { headers: H })).json() as Masters;
  const id = (table: string, code: string) => m.find((x) => x.table === table && x.code === code)!.id;
  const client = crypto.randomUUID();
  const clientName = `Cliente E2E ${Date.now()}`;
  expect((await admin.ctx.put('/api/v1/tenant/masters/items', { headers: H, data: { table: 'CLIENT', id: client, code: `E2E${Date.now()}`, label: { es: clientName } } })).ok()).toBeTruthy();
  return { admin, H, id, client, clientName };
}

test('tablero de RQ: alta en modal, arrastrar entre estados, mover con menú y cerrar', async ({ page }) => {
  const { admin, clientName } = await setup();
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Requerimientos' }).click();
  await expect(page.getByTestId('rq-board')).toBeVisible();

  // alta: datos + una vacante (el código se autogenera)
  await page.getByTestId('rq-new').click();
  const dlg = page.getByRole('dialog', { name: 'Nuevo requerimiento' });
  const title = `QA automatizado ${Date.now()}`;
  await pickOption(dlg, 'Cliente', clientName, clientName.slice(0, 18));
  await dlg.getByLabel('Título').fill(title);
  await dlg.getByTestId('rq-save').click();
  await expect(dlg.getByRole('alert')).toContainText('Agrega al menos una vacante.');
  await dlg.getByTestId('rq-tab-vacancies').click();
  await dlg.getByTestId('rq-add-vacancy').click();
  await dlg.getByTestId('rq-vacancy-profile').selectOption({ label: 'Analista QA' });
  await dlg.getByLabel('Cantidad').fill('2');
  await dlg.getByTestId('rq-save').click();
  await expect(page).toHaveURL(/\/fractal\/requerimientos\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await expect(page.getByTestId('rq-coverage')).toHaveText('0 de 2 cubiertas');
  const code = (await page.locator('.rq-head .rq-code').textContent())!;
  expect(code).toMatch(/^RQ-\d{4}-\d{4}$/);
  await expect(page.getByTestId('rq-owners')).toHaveText('Responsable: Prueba E2E');

  // tablero: aparece en "Registrado"; se arrastra a "Asignado"
  await page.getByRole('link', { name: 'Tablero' }).click();
  await page.getByTestId('rq-search').fill(code);
  await expect(page.getByTestId('rq-board').getByTestId('kanban-card')).toHaveCount(1); // filtro aplicado (espera de 300 ms)
  const card = page.getByTestId(`rq-card-${code}`);
  await expect(column(page, 'rq-board', 'Registrado').getByTestId(`rq-card-${code}`)).toBeVisible();
  await drag(page, card, column(page, 'rq-board', 'Asignado'));
  await expect(page.getByText(`${code} pasó a Asignado.`).last()).toBeVisible();
  await expect(column(page, 'rq-board', 'Asignado').getByTestId(`rq-card-${code}`)).toBeVisible();

  // alternativa accesible: menú "Mover a…"
  await card.getByTestId('rq-move').click();
  await page.getByRole('menuitemradio', { name: 'En selección' }).click();
  await expect(column(page, 'rq-board', 'En selección').getByTestId(`rq-card-${code}`)).toBeVisible();

  // soltar en "Cerrados" pide el motivo
  await drag(page, card, column(page, 'rq-board', 'Cerrados'));
  // dnd-kit bloquea los clics hasta 50 ms después de soltar (evita que el soltar active algo); una persona tarda más
  await expect(page.getByTestId('rq-close-CANCELLED')).toBeVisible();
  await page.waitForTimeout(150);
  await page.getByTestId('rq-close-CANCELLED').click();
  await expect(page.getByText(`${code} pasó a Cancelado.`).last()).toBeVisible();
  // la vista por defecto solo muestra lo abierto: el cerrado se encuentra en la pestaña "Cerrados", en su columna
  await expect(page.getByTestId(`rq-card-${code}`)).toHaveCount(0);
  await page.getByTestId('rq-scope-CLOSED').click();
  await expect(column(page, 'rq-board', 'Cancelado').getByTestId(`rq-card-${code}`)).toBeVisible();
});

test('vistas del tablero, filtros y reapertura por el jefe de selección', async ({ page }) => {
  const { admin, H, id, client } = await setup();
  const lead = await createFractalAdmin('SELECTION_LEAD');
  const tag = `Vista${Date.now()}`;
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const make = async (suffix: string, due: number, profile = 'QA_ANALYST') => {
    const rq = crypto.randomUUID();
    const res = await admin.ctx.put(`/api/v1/tenant/requirements/${rq}`, { headers: H, data: {
      clientId: client, title: `${tag} ${suffix}`, statusId: id('RQ_STATUS', 'IN_SELECTION'), requestDate: day(-20), dueDate: day(due),
      vacancies: [{ id: crypto.randomUUID(), profileId: id('RQ_PROFILE', profile), quantity: 1 }] } });
    expect(res.status()).toBe(201);
    return { id: rq, code: (await res.json()).code as string };
  };
  const vigente = await make('vigente', 10, 'JAVA_DEV');
  const pronto = await make('pronto', 2);
  const vencido = await make('vencido', -5);
  const cerrado = await make('cerrado', -1);
  expect((await admin.ctx.patch(`/api/v1/tenant/requirements/${cerrado.id}/status`, { headers: H, data: { statusId: id('RQ_STATUS', 'FINISHED') } })).ok()).toBeTruthy();

  // reglas del servidor: un cerrado no vuelve a abrirse moviéndolo, y el admin no tiene rq.reopen
  expect((await admin.ctx.patch(`/api/v1/tenant/requirements/${cerrado.id}/status`, { headers: H, data: { statusId: id('RQ_STATUS', 'ASSIGNED') } })).status()).toBe(409);
  expect((await admin.ctx.post(`/api/v1/tenant/requirements/${cerrado.id}/reopen`, { headers: H, data: { reason: 'RESIGNATION' } })).status()).toBe(403);
  // filtro por perfil (API): solo el de Java
  const byProfile = await (await admin.ctx.post('/api/v1/tenant/requirements/board', { headers: H,
    data: { scope: 'ALL', search: tag, profileId: id('RQ_PROFILE', 'JAVA_DEV'), today: day(0) } })).json();
  expect(byProfile.cards.map((c: { code: string }) => c.code)).toEqual([vigente.code]);
  expect(byProfile.counts).toMatchObject({ all: 1, active: 1 });

  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLogin(page, 'fractal', lead.email, lead.password);
  await page.goto('/fractal/requerimientos');
  await expect(page.getByTestId('rq-new')).toBeVisible(); // el jefe de selección crea RQ
  await page.getByTestId('rq-search').fill(tag);
  const cards = page.getByTestId('rq-board').getByTestId('kanban-card');
  const shows = async (scope: string, codes: string[]) => {
    await page.getByTestId(`rq-scope-${scope}`).click();
    await expect(cards).toHaveCount(codes.length);
    for (const c of codes) await expect(page.getByTestId(`rq-card-${c}`)).toBeVisible();
  };
  // por defecto: abiertos sin vencer (ni vencidos ni cerrados)
  await expect(cards).toHaveCount(2);
  await expect(page.getByTestId('rq-scope-OVERDUE')).toContainText('1');
  await shows('SOON', [pronto.code]);
  await shows('OVERDUE', [vencido.code]);
  await shows('CLOSED', [cerrado.code]);
  await expect(column(page, 'rq-board', 'Terminado').getByTestId(`rq-card-${cerrado.code}`)).toBeVisible();
  await shows('ALL', [vigente.code, pronto.code, vencido.code, cerrado.code]);
  await expect(column(page, 'rq-board', 'A procesar')).toBeVisible();

  // reabrir desde la ficha: motivo obligatorio; "más vacantes" abre el editor para ampliarlas
  await page.getByTestId(`rq-card-${cerrado.code}`).getByRole('link').click();
  await page.getByTestId('rq-reopen').click();
  const dlg = page.getByRole('dialog', { name: `Reabrir ${cerrado.code}` });
  await expect(dlg.getByTestId('rq-reopen-confirm')).toBeDisabled();
  await dlg.getByTestId('rq-reopen-MORE_VACANCIES').check();
  await dlg.getByLabel('Detalle (opcional)').fill('El cliente pide 2 personas más');
  await dlg.getByTestId('rq-reopen-confirm').click();
  await expect(page.getByText(`${cerrado.code} reabierto`).last()).toBeVisible();
  const editor = page.getByRole('dialog', { name: `Editar ${cerrado.code}` });
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('rq-tab-vacancies')).toHaveAttribute('aria-selected', 'true'); // directo a ampliar vacantes
  await editor.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('rq-status')).toHaveText('En selección');
  await expect(page.getByTestId('rq-reopen')).toHaveCount(0);
  await page.getByTestId('rq-tab-detail').click();
  await expect(page.getByTestId('rq-reopens')).toContainText('Se necesitan más vacantes');
  await expect(page.getByTestId('rq-reopens')).toContainText('El cliente pide 2 personas más');
});

test('reapertura por renuncia: se indica quién renunció y queda marcado en el pipeline', async ({ page }) => {
  const { admin, H, id, client } = await setup();
  const lead = await createFractalAdmin('SELECTION_LEAD');
  const today = new Date().toISOString().slice(0, 10);
  const rq = crypto.randomUUID();
  const vac = crypto.randomUUID();
  const res = await admin.ctx.put(`/api/v1/tenant/requirements/${rq}`, { headers: H, data: {
    clientId: client, title: `Renuncia ${Date.now()}`, statusId: id('RQ_STATUS', 'IN_PRODUCTION'), requestDate: today, dueDate: today,
    vacancies: [{ id: vac, profileId: id('RQ_PROFILE', 'QA_ANALYST'), quantity: 1 }] } });
  expect(res.status()).toBe(201);
  const code = (await res.json()).code as string;
  const last = `Renuncia${Date.now()}`;
  const talent = crypto.randomUUID();
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id: talent, firstName: 'Rosa', lastName: last } })).status()).toBe(201);
  const cand = crypto.randomUUID();
  expect((await admin.ctx.post(`/api/v1/tenant/requirements/${rq}/candidates`, { headers: H, data: { id: cand, talentId: talent, vacancyId: vac } })).status()).toBe(201);
  for (const st of ['DATA_COMPLETE', 'CONFIRMED']) {
    expect((await admin.ctx.patch(`/api/v1/tenant/requirements/candidates/${cand}`, { headers: H, data: { stageId: id('CANDIDATE_STAGE', st) } })).ok()).toBeTruthy();
  }
  expect((await admin.ctx.patch(`/api/v1/tenant/requirements/${rq}/status`, { headers: H, data: { statusId: id('RQ_STATUS', 'ATTENDED') } })).ok()).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLogin(page, 'fractal', lead.email, lead.password);
  await page.goto(`/fractal/requerimientos/${rq}`);
  await expect(page.getByTestId('rq-coverage')).toHaveText('1 de 1 cubiertas');
  await page.getByTestId('rq-reopen').click();
  const dlg = page.getByRole('dialog', { name: `Reabrir ${code}` });
  await dlg.getByTestId('rq-reopen-RESIGNATION').check();
  await expect(dlg.getByTestId('rq-reopen-confirm')).toBeDisabled(); // falta indicar quién
  await dlg.getByTestId('rq-reopen-candidates').getByText(`Rosa ${last}`).click();
  await dlg.getByTestId('rq-reopen-confirm').click();
  await expect(page.getByText(`${code} reabierto`).last()).toBeVisible();

  // queda en el pipeline, marcado, sin menú para moverlo, y la vacante vuelve a estar libre
  const card = page.getByTestId('kanban-card').filter({ hasText: last });
  await expect(card.getByTestId('cand-resigned')).toHaveText('Renunció · baja pendiente');
  await expect(card.getByTestId('cand-move')).toHaveCount(0);
  await expect(page.getByTestId('rq-coverage')).toHaveText('0 de 1 cubiertas');
  await page.getByTestId('rq-tab-detail').click();
  await expect(page.getByTestId('rq-reopens')).toContainText(`Rosa ${last}`);
  // y en las postulaciones del talento
  await page.goto(`/fractal/talentos/${talent}`);
  await expect(page.getByTestId('talent-application').getByTestId('cand-resigned')).toBeVisible();
});

test('pipeline de candidatos: agregar, arrastrar entre etapas, reglas de confirmación y postulaciones', async ({ page }) => {
  const { admin, H, id, client } = await setup();
  const rec = await createFractalAdmin('RECRUITER');
  const rq = crypto.randomUUID();
  const vac = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  expect((await admin.ctx.put(`/api/v1/tenant/requirements/${rq}`, { headers: H, data: {
    clientId: client, title: `Java senior ${Date.now()}`, statusId: id('RQ_STATUS', 'REGISTERED'), requestDate: today, dueDate: today,
    vacancies: [{ id: vac, profileId: id('RQ_PROFILE', 'JAVA_DEV'), quantity: 1, rateInitial: 50, rateFinal: 70 }] } })).status()).toBe(201);
  const stamp = Date.now();
  const names = [`Pipe Uno${stamp}`, `Pipe Dos${stamp}`];
  for (const n of names) {
    const [first, last] = n.split(' ');
    expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id: crypto.randomUUID(), firstName: first, lastName: last, headline: 'Java Developer' } })).status()).toBe(201);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLogin(page, 'fractal', rec.email, rec.password);
  await page.goto(`/fractal/requerimientos/${rq}`);
  await expect(page.getByTestId('rq-pipeline')).toBeVisible();
  await expect(page.getByTestId('rq-edit')).toHaveCount(0); // el reclutador no edita el RQ
  await page.getByTestId('rq-tab-detail').click();
  await expect(page.getByTestId('rq-vacancies')).not.toContainText('Tarifa'); // ni ve tarifas
  await page.getByTestId('rq-tab-pipeline').click();

  // agregar los dos candidatos
  for (const n of names) {
    await page.getByTestId('rq-add-candidate').click();
    const dlg = page.getByRole('dialog', { name: /Agregar candidato/ });
    await dlg.getByLabel('Buscar talento').fill(n);
    await dlg.getByTestId('cand-option').filter({ hasText: n }).click();
    await dlg.getByTestId('cand-add-confirm').click();
    await expect(page.getByText(`${n} se agregó al requerimiento.`).last()).toBeVisible();
  }
  const uno = page.getByTestId('kanban-card').filter({ hasText: names[0] });
  const dos = page.getByTestId('kanban-card').filter({ hasText: names[1] });
  await expect(column(page, 'rq-pipeline', 'Observado').getByTestId('kanban-card')).toHaveCount(2);

  // desde "Observado" no se confirma: el servidor lo rechaza y la tarjeta vuelve
  await drag(page, uno, column(page, 'rq-pipeline', 'Confirmado'));
  await expect(page.getByText('Para confirmar, el candidato debe tener al menos datos completos.').last()).toBeVisible();
  await expect(column(page, 'rq-pipeline', 'Observado').filter({ hasText: names[0] })).toHaveCount(1);

  // Datos completos -> Confirmado
  await drag(page, uno, column(page, 'rq-pipeline', 'Datos completos'));
  await expect(column(page, 'rq-pipeline', 'Datos completos').filter({ hasText: names[0] })).toHaveCount(1);
  await drag(page, uno, column(page, 'rq-pipeline', 'Confirmado'));
  await expect(page.getByText(`${names[0]} pasó a Confirmado.`).last()).toBeVisible();
  await expect(page.getByTestId('rq-coverage')).toHaveText('1 de 1 cubiertas');

  // la vacante tiene 1 puesto: el segundo no se confirma (menú "Mover a…")
  await dos.getByTestId('cand-move').click();
  await page.getByRole('menuitemradio', { name: 'Datos completos' }).click();
  await expect(column(page, 'rq-pipeline', 'Datos completos').filter({ hasText: names[1] })).toHaveCount(1);
  await drag(page, dos, column(page, 'rq-pipeline', 'Confirmado'));
  await expect(page.getByText('La vacante ya tiene todos sus puestos confirmados.').last()).toBeVisible();

  // ficha del talento: postulaciones
  await uno.getByRole('link', { name: names[0] }).click();
  await expect(page.getByTestId('talent-application')).toContainText('Confirmado');
});

test('RQ: el alta notifica a los demás usuarios del tenant', async ({ page }) => {
  const { admin, H, id, client } = await setup();
  const reader = await createFractalAdmin('RECRUITER');
  await uiLogin(page, 'fractal', reader.email, reader.password);
  const rq = crypto.randomUUID();
  const title = `Notificado ${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const res = await admin.ctx.put(`/api/v1/tenant/requirements/${rq}`, { headers: H, data: {
    clientId: client, title, statusId: id('RQ_STATUS', 'REGISTERED'), requestDate: today, dueDate: today,
    vacancies: [{ id: crypto.randomUUID(), profileId: id('RQ_PROFILE', 'QA_ANALYST'), quantity: 1 }] } });
  expect(res.status()).toBe(201);
  const code = (await res.json()).code;
  await page.reload();
  await page.getByTestId('notif-bell').click();
  const item = page.getByTestId('notif-item').filter({ hasText: code });
  await expect(item).toContainText(`registró el requerimiento ${code} · ${title}`);
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/fractal/requerimientos/${rq}$`));
});
