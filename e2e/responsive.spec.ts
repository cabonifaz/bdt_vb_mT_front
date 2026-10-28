import { test, expect, type Page } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);

test('móvil: listado y ficha por turnos, sin scroll horizontal, tablas y modales caben', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const talentId = crypto.randomUUID();
  const last = `Movil${Date.now()}`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` }, data: { id: talentId, firstName: 'Ana', lastName: last, headline: 'QA' } })).status()).toBe(201);

  await uiLogin(page, 'fractal', admin.email, admin.password);
  await noHorizontalScroll(page);
  // sin selección: solo el listado
  await page.getByPlaceholder('Nombre o puesto').fill(last);
  await expect(page.locator('.ws-detail')).toBeHidden();
  await page.locator('.talent-row').filter({ hasText: last }).click();
  // con selección: solo la ficha, con «volver»
  await expect(page.locator('.ws-side')).toBeHidden();
  await expect(page.locator('.pf-head')).toContainText(last);
  await noHorizontalScroll(page);
  await page.getByTestId('ws-back').click();
  await expect(page.locator('.ws-side')).toBeVisible();
  // el filtro en memoria se conserva al volver
  await expect(page.getByPlaceholder('Nombre o puesto')).toHaveValue(last);

  // el modal de creación ocupa el ancho de la pantalla
  await page.getByTestId('new-talent').click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar' })).toBeInViewport();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

  for (const path of ['lista-negra', 'entrevistas', 'favoritos', 'clientes', 'usuarios', 'marca']) {
    await page.goto(`/fractal/${path}`);
    await page.locator('.ws, .page').first().waitFor();
    await noHorizontalScroll(page);
  }
  // tablas como tarjetas: cada celda con el título de su columna
  await page.goto('/fractal/clientes');
  await expect(page.locator('table.table td[data-label="RUC"]').first()).toBeVisible();
});
