import { test, expect } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

test('inicio: agenda, últimos talentos, carga del mes y RQ de ejemplo', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const last = `Inicio${Date.now()}`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id: crypto.randomUUID(), firstName: 'Nora', lastName: last } })).status()).toBe(201);

  // el resumen viene del backend (hoy en la zona del tenant, 3 meses, máx. 10 talentos)
  const res = await admin.ctx.get('/api/v1/tenant/home', { headers: H });
  expect(res.status()).toBe(200);
  const sum = await res.json();
  expect(sum.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(sum.months).toHaveLength(3);
  expect(sum.talents.length).toBeLessThanOrEqual(10);
  expect(sum.talents[0]).toMatchObject({ lastName: last, isNew: true });

  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.goto('/fractal');
  await expect(page.getByTestId('home-kpis')).toContainText('Mis entrevistas del mes');
  await expect(page.getByTestId('home-kpis')).toContainText('vs mes pasado');
  await expect(page.getByTestId('home-agenda')).toBeVisible();
  const latest = page.getByTestId('home-talents');
  await expect(latest.getByRole('link', { name: new RegExp(`Nora ${last}`) })).toContainText('Nuevo');
  await expect(page.getByTestId('home-rq-due')).toContainText('Ejemplo');
  await expect(page.getByTestId('home-rq-new').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('home-months').locator('tbody tr')).toHaveCount(3);
  await latest.getByRole('link', { name: new RegExp(`Nora ${last}`) }).click();
  await expect(page.getByTestId('talent-name')).toHaveText(`Nora ${last}`);
});

test('inicio en móvil: sin scroll horizontal', async ({ page }) => {
  const admin = await createFractalAdmin();
  await page.setViewportSize({ width: 390, height: 844 });
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.goto('/fractal');
  await expect(page.getByTestId('home-months')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
