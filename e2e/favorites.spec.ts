import { test, expect } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test('favoritos: crear colección, agregar talento, compartir y ver como compartida', async ({ page, browser }) => {
  const owner = await createFractalAdmin();
  const other = await createFractalAdmin('RECRUITER');
  const tok = await apiLogin(owner.ctx, owner.email, owner.password, 'fractal');
  const talentId = crypto.randomUUID();
  const last = `Favorito${stamp()}`;
  expect((await owner.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` },
    data: { id: talentId, firstName: 'Ana', lastName: last, headline: 'QA' } })).status()).toBe(201);

  await uiLogin(page, 'fractal', owner.email, owner.password);
  await page.getByTestId('sidebar').getByRole('link', { name: 'Favoritos' }).click();
  await page.getByTestId('new-collection').click();
  const collName = `Seleccionados ${stamp().slice(-5)}`;
  await page.getByRole('dialog').getByLabel('Nombre de la colección').fill(collName);
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('collection-name')).toHaveText(collName);

  // agregar el talento desde su ficha (♥)
  await page.goto(`/fractal/talentos/${talentId}`);
  await page.getByTestId('fav-talent').click();
  await page.getByRole('dialog').getByLabel(new RegExp(collName)).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();

  // compartir con permiso de solo ver
  await page.getByTestId('sidebar').getByRole('link', { name: 'Favoritos' }).click();
  await page.getByTestId('collection-row').filter({ hasText: collName }).click();
  await expect(page.getByTestId('favorite-talent')).toContainText(last);
  await page.getByTestId('share-collection').click();
  const opt = page.getByRole('dialog').getByLabel('Compañero').locator('option', { hasText: other.email });
  await page.getByRole('dialog').getByLabel('Compañero').selectOption(await opt.getAttribute('value') ?? '');
  await page.getByTestId('add-share').click();
  await expect(page.getByTestId('share-row')).toContainText(other.email);
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('.pf-sub')).toContainText('compartida con 1 persona');

  // el otro usuario la ve en "Compartidas conmigo", sin poder quitar talentos
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await uiLogin(p2, 'fractal', other.email, other.password);
  await p2.getByTestId('sidebar').getByRole('link', { name: 'Favoritos' }).click();
  const row = p2.getByTestId('collection-row').filter({ hasText: collName });
  await expect(row).toBeVisible();
  await row.click();
  await expect(p2.locator('.pf-sub')).toContainText('Solo ver');
  await expect(p2.getByTestId('favorite-talent')).toContainText(last);
  await expect(p2.getByRole('button', { name: 'Quitar de la colección' })).toHaveCount(0);
  await expect(p2.getByTestId('share-collection')).toHaveCount(0);
  // puede salir de la colección
  p2.once('dialog', (d) => d.accept());
  await p2.getByTestId('delete-collection').click();
  await expect(p2.getByTestId('collection-row').filter({ hasText: collName })).toHaveCount(0);
  await ctx2.close();

  // la colección sigue para el dueño, ahora sin compartir
  await page.reload();
  await expect(page.locator('.pf-sub')).toContainText('Privada');
});
