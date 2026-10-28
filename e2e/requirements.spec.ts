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
  await expect(column(page, 'rq-board', 'Cerrados').getByTestId(`rq-card-${code}`)).toContainText('Cancelado');
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
