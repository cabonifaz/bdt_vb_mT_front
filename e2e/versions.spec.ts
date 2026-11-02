import { test, expect } from '@playwright/test';
import { SA_EMAIL, SA_PASSWORD, createFractalAdmin, uiLoginOk } from './helpers';

test.describe.configure({ timeout: 120_000 });

test('versión junto al logo (login y app) y pantalla de versiones', async ({ page, request }) => {
  const v = await (await request.get(`${process.env.E2E_API_URL ?? 'http://localhost:8080'}/api/v1/version`)).json();
  expect(v.version).toMatch(/^\d+\.\d+$/);

  await page.goto('/fractal/login');
  await expect(page.getByTestId('version-badge')).toContainText(`v${v.version}`);

  const rec = await createFractalAdmin('RECRUITER');
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', rec.email, rec.password);
  const badge = page.getByTestId('sidebar').getByTestId('version-badge');
  await expect(badge).toContainText(`v${v.version}`);
  await expect(badge).toContainText(v.status === 'STABLE' ? 'Estable' : v.status === 'CANDIDATE' ? 'Candidata' : 'En pruebas');
  await page.getByRole('link', { name: 'Versiones' }).click();
  await expect(page).toHaveURL(/\/fractal\/versiones$/);
  await expect(page.getByRole('heading', { name: 'Versiones' })).toBeVisible();
  await expect(page.getByTestId('version-envs')).toHaveCount(0); // los ambientes solo los ve el Super Admin
});

test('el Super Admin ve la versión de cada ambiente', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill(SA_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(SA_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/admin') && !u.pathname.endsWith('/login'));
  await page.goto('/admin/versiones');
  await expect(page.getByTestId('version-envs')).toContainText('este ambiente');
});
