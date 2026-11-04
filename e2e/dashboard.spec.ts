import { test, expect } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk } from './helpers';

// Indicadores de selección: el admin los ve (resumen, vencidos, evolución, analistas, embudo, clientes, perfiles),
// cambia período y agrupación; un reclutador no tiene acceso (ni menú ni API).
test.describe.configure({ timeout: 180_000 });

test('indicadores de selección: bloques, período y agrupación', async ({ page }) => {
  const admin = await createFractalAdmin('TENANT_ADMIN');
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Indicadores' }).click();
  await expect(page).toHaveURL(/\/fractal\/indicadores$/);
  await expect(page.getByRole('heading', { name: 'Indicadores de selección' })).toBeVisible();
  for (const id of ['dash-overview', 'dash-overdue', 'dash-evolution', 'dash-analysts', 'dash-funnel', 'dash-multi', 'dash-clients', 'dash-profiles', 'dash-closing']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('dash-k-hires')).toContainText(/\d/);
  await expect(page.getByTestId('dash-analyst').first()).toBeVisible();
  // el jefe de selección aparece entre los analistas
  await expect(page.getByTestId('dash-analysts')).toContainText('Jefe');
  // agrupar por semanas: más barras y el promedio «por semana»
  await page.getByTestId('dash-grain-WEEK').click();
  await expect(page.getByTestId('dash-evolution')).toContainText('por semana');
  await page.getByTestId('dash-preset-12M').click();
  await expect(page.getByTestId('dash-from')).toHaveValue(/^\d{4}-\d{2}-01$/);
});

test('un reclutador no accede a los indicadores', async ({ page }) => {
  const rec = await createFractalAdmin('RECRUITER');
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', rec.email, rec.password);
  await expect(page.getByRole('link', { name: 'Indicadores' })).toHaveCount(0);
  const token = await apiLogin(rec.ctx, rec.email, rec.password, 'fractal');
  const r = await rec.ctx.post('/api/v1/tenant/dashboard/selection', { headers: { Authorization: `Bearer ${token}` },
    data: { from: '2026-01-01', to: '2026-06-30', grain: 'MONTH' } });
  expect(r.status()).toBe(403);
});
