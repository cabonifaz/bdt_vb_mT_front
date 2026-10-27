import { test, expect } from '@playwright/test';
import { apiCtx, createFractalAdmin, uniq, uiLogin } from './helpers';

test('flujo completo: el admin invita, el usuario activa su cuenta y entra', async ({ page, browser }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await page.getByRole('button', { name: 'Invitar usuario' }).click();
  const newEmail = `${uniq('reclutador')}@fractal.test`;
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Correo').fill(newEmail);
  await dialog.getByLabel('Rol').selectOption('RECRUITER');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  const link = (await page.getByTestId('invite-link').textContent())!;
  expect(link).toContain('/invitacion/');

  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(new URL(link).pathname);
  await expect(p2.getByRole('heading', { name: 'Activa tu cuenta' })).toBeVisible();
  await expect(p2.getByText(/como Reclutador/)).toBeVisible();
  await p2.getByLabel('Nombre completo').fill('Reclutador E2E');
  await p2.getByLabel('Crea una contraseña').fill('corta');
  await p2.getByLabel('Confirma la contraseña').fill('corta');
  await p2.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(p2.getByRole('alert')).toHaveText('La contraseña no cumple la política de seguridad.');
  const pw = `Reclu-${Date.now()}-ok!`;
  await p2.getByLabel('Crea una contraseña').fill(pw);
  await p2.getByLabel('Confirma la contraseña').fill(pw);
  await p2.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(p2.getByText('Cuenta activada')).toBeVisible();
  await p2.getByRole('link', { name: 'Ir al inicio de sesión' }).click();
  await uiLogin(p2, 'fractal', newEmail, pw);
  await expect(p2.getByRole('heading', { name: /Hola, Reclutador/ })).toBeVisible();
  // un reclutador no ve la administración
  await expect(p2.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  await ctx2.close();

  // el enlace ya usado no sirve
  const api = await apiCtx();
  const token = new URL(link).pathname.split('/').pop();
  expect((await api.get(`/api/v1/invitations/${token}`)).status()).toBe(409);
});

test('el admin cambia los colores del tenant y se aplican', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Marca y colores' }).click();
  const field = page.getByRole('textbox', { name: 'Color de acento', exact: true });
  try {
    await field.fill('#FF5722');
    await page.getByTestId('save-branding').click();
    await expect(page.getByText('Marca actualizada')).toBeVisible();
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim());
    expect(accent.toUpperCase()).toBe('#FF5722');
    await expect.poll(async () => (await (await (await apiCtx()).get('/api/v1/public/tenants/fractal')).json()).colorAccent).toBe('#FF5722');
  } finally {
    // restaurar siempre el acento original de Fractal
    await field.fill('#FAAB34');
    await page.getByTestId('save-branding').click();
    await expect.poll(async () => (await (await (await apiCtx()).get('/api/v1/public/tenants/fractal')).json()).colorAccent).toBe('#FAAB34');
  }
});
