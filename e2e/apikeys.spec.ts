import { test, expect } from '@playwright/test';
import { API, SA_EMAIL, SA_PASSWORD, apiCtx, createFractalAdmin, uiLogin } from './helpers';

test('API key: el tenant la solicita, el Super Admin la habilita y el sistema externo la usa', async ({ page, browser }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'API de integración' }).click();
  await page.getByRole('button', { name: 'Solicitar API key' }).click();
  await page.getByRole('dialog').getByLabel('Nombre del sistema').fill('ERP prueba e2e');
  await page.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
  const secret = (await page.getByTestId('api-key-secret').textContent())!.trim();
  expect(secret).toMatch(/^bdt_[a-z0-9]{12}_/);
  const prefix = secret.split('_')[1];

  const api = await apiCtx();
  expect((await api.get('/integration/v1/whoami', { headers: { 'X-Api-Key': secret } })).status()).toBe(403);

  const saCtx = await browser.newContext();
  const sa = await saCtx.newPage();
  await sa.goto('/admin/login');
  await sa.getByLabel('Correo').fill(SA_EMAIL);
  await sa.getByLabel('Contraseña', { exact: true }).fill(SA_PASSWORD);
  await sa.getByRole('button', { name: 'Ingresar' }).click();
  await sa.getByRole('link', { name: 'Aprobación de API keys' }).click();
  const row = sa.getByTestId(`key-${prefix}`);
  await expect(row).toContainText('Pendiente');
  await row.getByRole('button', { name: 'Habilitar' }).click();
  await expect(row).toContainText('Habilitada');
  await saCtx.close();

  const who = await api.get('/integration/v1/whoami', { headers: { 'X-Api-Key': secret } });
  expect(who.status()).toBe(200);
  expect((await who.json()).tenant).toBe('fractal');
  const masters = await api.get('/integration/v1/masters?tables=LANGUAGE', { headers: { 'X-Api-Key': secret } });
  expect(masters.status()).toBe(200);
  expect((await masters.json()).length).toBeGreaterThan(0);

  // Documentación tipo Swagger: la página pide key y la especificación exige key
  await page.goto(`${API}/integration/docs`);
  await page.getByLabel('API key').fill(secret);
  await page.getByRole('button', { name: 'Ver documentación' }).click();
  await expect(page.getByText('Banco de Talentos - API de integración')).toBeVisible();
});
