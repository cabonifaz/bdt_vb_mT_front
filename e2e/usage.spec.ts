import { test, expect } from '@playwright/test';
import { SA_EMAIL, SA_PASSWORD, apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

// Consumo por tenant (Super Admin): cada traducción de CV con IA suma tokens al tenant; sin token del proveedor de DNI
// no hay llamada y no se cuenta.
test('Super Admin ve el consumo de DNI y tokens de IA por tenant', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const id = crypto.randomUUID();
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id, firstName: 'Uso', lastName: `Ia${Date.now()}`, headline: 'Analista QA' } })).status()).toBe(201);

  const month = new Date().toISOString().slice(0, 7);
  const fractalTokens = async () => {
    const sa = await apiLogin(admin.ctx, SA_EMAIL, SA_PASSWORD);
    const rows = await (await admin.ctx.get(`/api/v1/platform/usage?from=${month}-01&to=${month}-28`, { headers: { Authorization: `Bearer ${sa}` } })).json() as
      { slug: string; kind: string; promptTokens: number; completionTokens: number; calls: number }[];
    return rows.filter((r) => r.slug === 'fractal' && r.kind === 'AI_TRANSLATE').reduce((a, r) => ({ calls: a.calls + r.calls, tokens: a.tokens + r.promptTokens + r.completionTokens }), { calls: 0, tokens: 0 });
  };
  const before = await fractalTokens();
  // traducción real con IA (solo si el entorno tiene OPENAI_API_KEY); sin key no se cuenta
  const tr = await admin.ctx.post(`/api/v1/tenant/talents/${id}/cv/translate`, { headers: H, data: { lang: 'en' } });
  const after = await fractalTokens();
  if (tr.ok()) {
    expect(after.calls).toBe(before.calls + 1);
    expect(after.tokens).toBeGreaterThan(before.tokens);
  } else {
    expect(tr.status()).toBe(503);
    expect(after).toEqual(before);
  }

  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill(SA_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(SA_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('link', { name: 'Consumo' }).click();
  await expect(page.getByRole('heading', { name: 'Consumo por tenant' })).toBeVisible();
  await expect(page.getByTestId('kpi-tokens')).toBeVisible();
  if (after.calls > 0) {
    const row = page.getByTestId('usage-fractal');
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Detalle por mes' }).click();
    await expect(page.locator('.usage-sub').first()).toContainText('IA');
    // búsqueda en memoria
    await page.getByRole('searchbox', { name: 'Buscar' }).fill('no-existe-xyz');
    await expect(page.getByText('Sin consumo en el período.')).toBeVisible();
  }
  // rango inválido: se avisa sin consultar
  await page.getByLabel('Desde').fill('2026-12');
  await page.getByLabel('Hasta').fill('2026-01');
  await expect(page.getByRole('alert')).toContainText('anterior o igual');
});

test('el consumo de plataforma no es visible para un tenant', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  expect((await admin.ctx.get('/api/v1/platform/usage?from=2026-01-01&to=2026-01-31', { headers: { Authorization: `Bearer ${tok}` } })).status()).toBe(403);
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.goto('/admin/consumo');
  await expect(page).toHaveURL(/\/fractal\//);
});
