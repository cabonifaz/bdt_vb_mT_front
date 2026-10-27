import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function setup() {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const auth = { Authorization: `Bearer ${tok}` };
  const clientName = `Cliente E2E ${stamp().slice(-6)}`;
  const clientId = crypto.randomUUID();
  expect((await admin.ctx.put('/api/v1/tenant/masters/items', { headers: auth,
    data: { table: 'CLIENT', id: clientId, code: `E2E${stamp()}`, label: { es: clientName, en: clientName }, str2: 'Av. Larco 345, Miraflores', str3: 'https://maps.app.goo.gl/e2e' } })).status()).toBe(200);
  const talentId = crypto.randomUUID();
  const last = `Lista${stamp()}`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: auth, data: { id: talentId, firstName: 'Carmen', lastName: last, headline: 'QA Analyst' } })).status()).toBe(201);
  return { admin, auth, clientId, clientName, talentId, last, ctx: admin.ctx as APIRequestContext };
}

test('lista negra: restringir desde la ficha, ver en el módulo, levantar global conservando cliente e historial', async ({ page }) => {
  const s = await setup();
  await uiLogin(page, 'fractal', s.admin.email, s.admin.password);
  await page.goto(`/fractal/talentos/${s.talentId}`);
  await page.getByTestId('bl-talent').click();
  await expect(page.getByTestId('bl-none')).toBeVisible();
  await page.getByTestId('bl-add').click();
  const dlg = page.getByRole('dialog', { name: 'Agregar a lista negra' });
  await dlg.getByLabel('Cliente').selectOption({ label: 'Todos los clientes' });
  await dlg.getByLabel('Motivo').fill('Información falsa en el CV');
  await dlg.getByTestId('bl-save').click();
  await expect(page.getByTestId('bl-global')).toContainText('Información falsa en el CV');

  // levantar la global conservando un cliente (operación atómica)
  await page.getByTestId('bl-lift').click();
  const lift = page.getByRole('dialog', { name: 'Levantar restricción global' });
  await lift.getByLabel('Motivo por el que se levanta la restricción global').fill('Se verificó la información');
  await lift.getByRole('button', { name: 'Desmarcar todos' }).click();
  await lift.getByTestId('lift-client').filter({ hasText: s.clientName }).getByRole('checkbox').check();
  await lift.getByRole('textbox', { name: `Motivo ${s.clientName}` }).fill('Se mantiene para este cliente');
  await lift.getByTestId('bl-save').click();
  await expect(page.getByTestId('bl-client')).toContainText(s.clientName);
  await expect(page.getByTestId('bl-global')).toHaveCount(0);
  await page.getByTestId('bl-history-toggle').click();
  await expect(page.getByTestId('bl-movement')).toHaveCount(3); // CREATE global, DELETE global, CREATE cliente
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByTestId('bl-chips')).toContainText(s.clientName);

  // el listado de talentos lo marca y el módulo lo muestra
  await page.getByTestId('sidebar').getByRole('link', { name: 'Lista negra' }).click();
  await page.getByPlaceholder('Buscar talento').fill(s.last);
  await expect(page.getByTestId('bl-row')).toHaveCount(1);
  await page.getByTestId('bl-row').click();
  await expect(page.getByTestId('bl-talent-name')).toContainText(s.last);
  await expect(page.getByTestId('bl-client')).toContainText('Se mantiene para este cliente');
});

test('entrevistas: virtual con aviso de lista negra, telefónica con cuestionario e ICS', async ({ page }) => {
  const s = await setup();
  // restricción para el cliente => la entrevista virtual pedirá confirmación
  expect((await s.ctx.post('/api/v1/tenant/blacklist', { headers: s.auth, data: { talentId: s.talentId, clientId: s.clientId, reason: 'No se presentó' } })).status()).toBe(201);
  await uiLogin(page, 'fractal', s.admin.email, s.admin.password);
  await page.getByTestId('sidebar').getByRole('link', { name: 'Entrevistas' }).click();
  await page.getByTestId('new-interview').click();
  const dlg = page.getByRole('dialog', { name: 'Nueva entrevista' });
  await dlg.getByLabel('Talento').fill(s.last);
  await dlg.getByRole('button', { name: new RegExp(s.last) }).click();
  await dlg.getByTestId('type-VIRTUAL').click();
  await dlg.getByLabel('Enlace de la reunión').fill('https://meet.example/e2e');
  await dlg.getByLabel('Etapa').selectOption({ label: 'Entrevista técnica con cliente' });
  await dlg.getByLabel('Perfil / puesto').fill('QA Senior');
  await dlg.getByLabel('Cliente').selectOption({ label: s.clientName });
  await expect(dlg.getByTestId('save-interview')).toBeDisabled(); // falta entrevistador
  await dlg.getByTestId('itab-interviewers').click();
  await dlg.getByTestId('add-interviewer').click();
  await dlg.getByLabel('Nombre completo').fill('Luis Paz');
  await dlg.getByLabel('Correo (opcional)').fill('luis.paz@cliente.test');
  page.once('dialog', (d) => { expect(d.message()).toContain('lista negra'); d.accept(); });
  await dlg.getByTestId('save-interview').click();
  await expect(page.getByTestId('iv-title')).toContainText(s.last);
  await expect(page.getByTestId('iv-blacklisted')).toBeVisible();
  // ICS
  const download = page.waitForEvent('download');
  await page.getByTestId('iv-ics').click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);

  // entrevista telefónica desde la ficha del talento, con cuestionario
  await page.goto(`/fractal/talentos/${s.talentId}`);
  await page.getByTestId('phone-interview').click();
  const ph = page.getByRole('dialog', { name: 'Nueva entrevista' });
  await expect(ph.getByTestId('iv-talent')).toContainText(s.last);
  await expect(ph.getByTestId('type-PHONE')).toHaveAttribute('aria-checked', 'true');
  await expect(ph.getByLabel('Enlace de la reunión')).toHaveCount(0);
  await ph.getByLabel('Perfil / puesto').fill('QA Senior');
  await ph.getByTestId('itab-questions').click();
  await ph.getByLabel(/disponibilidad para iniciar/).fill('Inmediata');
  await ph.getByTestId('save-interview').click();
  await expect(page.getByTestId('iv-title')).toContainText(s.last);
  await expect(page.getByTestId('iv-answer').first()).toContainText('Inmediata');

  // la segunda vez ofrece ir a la última o registrar una nueva
  await page.goto(`/fractal/talentos/${s.talentId}`);
  await expect(page.getByTestId('talent-interview')).toHaveCount(2);
  await page.getByTestId('phone-interview').click();
  await expect(page.getByText(/ya tiene una entrevista telefónica/)).toBeVisible();
  await page.getByTestId('phone-go-last').click();
  await expect(page.getByTestId('iv-answer').first()).toContainText('Inmediata');
});

test('clientes: el admin registra un cliente desde Administración', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByTestId('sidebar').getByRole('link', { name: 'Clientes' }).click();
  await page.getByTestId('new-client').click();
  const name = `Minera ${stamp().slice(-5)}`;
  await page.getByRole('dialog').getByLabel('Razón social').fill(name);
  await page.getByRole('dialog').getByLabel('RUC').fill('20512345678');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('client-row').filter({ hasText: name })).toContainText('20512345678');
});
