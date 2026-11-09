import { test, expect } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk } from './helpers';

// Alertas de RQ sin movimiento: vista y etiqueta en el tablero, aviso y días en etapa en la ficha, y configuración
// (solo admin y jefe de selección). Usa los RQ de Fractal; la configuración se restaura al final.
test.describe.configure({ timeout: 180_000 });

test('RQ sin movimiento: vista, etiqueta, aviso en la ficha y configuración de días', async ({ page }) => {
  const admin = await createFractalAdmin('TENANT_ADMIN');
  const token = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const auth = { Authorization: `Bearer ${token}` };
  const before = await (await admin.ctx.get('/api/v1/tenant/requirements/alert-settings', { headers: auth })).json();
  // críticos <= atención: inválido
  expect((await admin.ctx.put('/api/v1/tenant/requirements/alert-settings', { headers: auth, data: { warnDays: 5, criticalDays: 5, notify: true } })).status()).toBe(422);
  // umbral bajo para que haya RQ sin movimiento con datos recientes (sin avisos mientras dura la prueba)
  expect((await admin.ctx.put('/api/v1/tenant/requirements/alert-settings', { headers: auth, data: { warnDays: 1, criticalDays: 3, notify: false } })).status()).toBe(204);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await uiLoginOk(page, 'fractal', admin.email, admin.password);
    await page.goto('/fractal/requerimientos');
    const tab = page.getByTestId('rq-scope-STALE');
    await expect(tab).toContainText('Sin movimiento');
    await tab.click();
    const card = page.getByTestId('rq-board').locator('article.rq-card').filter({ has: page.getByTestId('rq-stale') }).first();
    await expect(card.getByTestId('rq-stale')).toContainText(/Sin movimiento · \d+ d/);
    await card.locator('a.rq-title').click();
    await expect(page.getByTestId('rq-stale-banner')).toContainText(/ningún postulante cambió de etapa hace \d+ días?/);
    await expect(page.getByTestId('cand-idle').first()).toContainText(/d háb. en etapa/);

    // configuración: con umbrales altos ya no hay RQ sin movimiento
    await page.goto('/fractal/requerimientos');
    await page.getByTestId('rq-alerts').click();
    await page.getByTestId('rq-stale-warn').fill('90');
    await page.getByTestId('rq-stale-crit').fill('80');
    await expect(page.getByTestId('rq-stale-save')).toBeDisabled();
    await page.getByTestId('rq-stale-crit').fill('180');
    await page.getByTestId('rq-stale-save').click();
    await expect(page.getByTestId('rq-scope-STALE')).toContainText('0');
  } finally {
    await admin.ctx.put('/api/v1/tenant/requirements/alert-settings', { headers: auth, data: before });
  }
});

test('un reclutador ve las alertas pero no las configura', async ({ page }) => {
  const rec = await createFractalAdmin('RECRUITER');
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', rec.email, rec.password);
  await page.goto('/fractal/requerimientos');
  await expect(page.getByTestId('rq-scope-STALE')).toBeVisible();
  await expect(page.getByTestId('rq-alerts')).toHaveCount(0);
  const token = await apiLogin(rec.ctx, rec.email, rec.password, 'fractal');
  const r = await rec.ctx.put('/api/v1/tenant/requirements/alert-settings', { headers: { Authorization: `Bearer ${token}` }, data: { warnDays: 2, criticalDays: 4, notify: true } });
  expect(r.status()).toBe(403);
});
