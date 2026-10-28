import { test, expect, type Route } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

const slow = (ms: number) => async (route: Route) => { await new Promise((r) => setTimeout(r, ms)); await route.continue(); };

test('carga con el logo del tenant: arranque, ficha y guardado largo', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const talentId = crypto.randomUUID();
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` }, data: { id: talentId, firstName: 'Lia', lastName: `Carga${Date.now()}` } })).status()).toBe(201);
  await uiLogin(page, 'fractal', admin.email, admin.password);
  const loader = page.getByTestId('loader');
  const logo = loader.locator('img.loader-logo');

  // ficha lenta: panel con el logo y luego el contenido
  await page.route(new RegExp(`/api/v1/tenant/talents/${talentId}$`), slow(1500));
  await page.goto(`/fractal/talentos/${talentId}`);
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', /fractal/i);
  await expect(page.locator('.pf-head')).toBeVisible();
  await expect(loader).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // guardado largo: superposición con el logo y el avance
  await page.getByTestId('new-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Nuevo talento' });
  await dlg.getByLabel('Nombres').fill('Ovi');
  await dlg.getByLabel('Apellido paterno').fill(`Lento${Date.now()}`);
  await page.route('**/api/v1/tenant/talents', slow(1500));
  await page.getByTestId('save-talent').click();
  await expect(page.locator('.loader-overlay img.loader-logo')).toBeVisible();
  await expect(page.locator('.loader-overlay')).toContainText('Guardando');
  await expect(dlg).toHaveCount(0, { timeout: 10000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // arranque (restaurar sesión al recargar): pantalla completa con el logo
  await page.route('**/api/v1/auth/refresh', slow(1500));
  await page.reload();
  await expect(page.locator('.loader-screen img.loader-logo')).toBeVisible();
  await expect(page.locator('.ws')).toBeVisible({ timeout: 15000 });
});
