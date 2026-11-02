import { test, expect, type Page } from '@playwright/test';
import { SA_EMAIL, SA_PASSWORD, apiCtx, apiLogin, createFractalAdmin, uiLoginOk } from './helpers';

test.describe.configure({ timeout: 180_000 });

async function saLogin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill(SA_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(SA_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/admin') && !u.pathname.endsWith('/login'));
}

test('funcionalidades: el Super Admin suspende Favoritos en una empresa y al activarla se avisa a los usuarios impactados', async ({ page, browser }) => {
  const rec = await createFractalAdmin('RECRUITER');
  const ctx = await apiCtx();
  const sa = await apiLogin(ctx, SA_EMAIL, SA_PASSWORD);
  const H = { Authorization: `Bearer ${sa}` };
  const tenants = await (await ctx.get('/api/v1/platform/features/favorites/tenants', { headers: H })).json() as { tenantId: string; slug: string }[];
  const fractal = tenants.find((x) => x.slug === 'fractal')!.tenantId;

  // el Super Admin la suspende para Fractal desde su pantalla
  const admin = await (await browser.newContext()).newPage();
  await admin.setViewportSize({ width: 1440, height: 900 });
  await saLogin(admin);
  await admin.goto('/admin/funcionalidades');
  const row = admin.getByTestId('feature-row').filter({ hasText: 'Favoritos y colecciones' });
  await expect(row).toBeVisible();
  await expect(admin.getByTestId('feature-row').filter({ hasText: 'Banco de talentos' }).getByTestId('feature-toggle')).toHaveCount(0); // núcleo
  await row.getByTestId('feature-tenants').click();
  const dlg = admin.getByRole('dialog', { name: /Favoritos y colecciones por empresa/ });
  const fr = dlg.getByTestId('feature-tenant').filter({ hasText: 'fractal' });
  if ((await fr.locator('.badge').textContent()) === 'Activa') await fr.getByTestId('feature-tenant-toggle').click();
  await expect(fr.locator('.badge')).toHaveText('Suspendida');

  // el usuario no la ve y la API la rechaza
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', rec.email, rec.password);
  await expect(page.getByRole('link', { name: 'Favoritos' })).toHaveCount(0);
  const tok = await apiLogin(ctx, rec.email, rec.password, 'fractal');
  const blocked = await ctx.get('/api/v1/tenant/collections', { headers: { Authorization: `Bearer ${tok}` } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('FEATURE_DISABLED');

  // la reactiva: el reclutador (rol impactado) recibe el aviso y vuelve a verla
  await fr.getByTestId('feature-tenant-toggle').click();
  await expect(fr.locator('.badge')).toHaveText('Activa');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Favoritos' })).toBeVisible();
  await page.getByTestId('notif-bell').click();
  await expect(page.getByTestId('notif-item').filter({ hasText: 'Ya puedes usar: Favoritos y colecciones' }).first()).toBeVisible();
  expect((await ctx.put(`/api/v1/platform/features/talents/tenants/${fractal}`, { headers: H, data: { enabled: false } })).status()).toBe(409); // núcleo
});

test('manual: el de su rol por defecto, el general con todo y se puede imprimir', async ({ page }) => {
  const rec = await createFractalAdmin('RECRUITER');
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', rec.email, rec.password);
  await page.goto('/fractal/manual');
  const doc = page.getByTestId('manual-doc');
  await expect(doc).toContainText('Manual del rol Reclutador');
  await expect(doc).toContainText('Pipeline de candidatos');
  await expect(doc).toContainText('Validación automática del CUL');
  await expect(doc).not.toContainText('Usuarios y roles'); // es del administrador
  await expect(page.getByTestId('manual-view-SUPER_ADMIN')).toHaveCount(0);
  await page.getByTestId('manual-view-GENERAL').click();
  await expect(doc).toContainText('Manual general del Banco de Talentos');
  await expect(doc).toContainText('Usuarios y roles');
  await expect(doc).not.toContainText('Publicar novedades'); // del Super Admin
  await expect(page.getByTestId('manual-print')).toBeVisible();
});
