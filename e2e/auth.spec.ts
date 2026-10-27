import { test, expect } from '@playwright/test';
import { SA_EMAIL, SA_PASSWORD, createFractalAdmin, uiLogin } from './helpers';

test.describe('Autenticación', () => {
  test('credenciales incorrectas muestran error genérico', async ({ page }) => {
    await uiLogin(page, 'fractal', 'nadie@fractal.test', 'Clave-Incorrecta-123');
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  });

  test('Super Admin entra a la plataforma, la sesión sobrevive a recargar y cierra sesión', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Correo').fill(SA_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(SA_PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Fractal/ }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('admin del tenant no puede entrar a la plataforma', async ({ page }) => {
    const { email, password } = await createFractalAdmin();
    await uiLogin(page, 'fractal', email, password);
    await expect(page.getByRole('heading', { name: /Hola, Prueba/ })).toBeVisible();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/fractal$/);
  });

  test('usuario de Fractal no entra por el login de plataforma', async ({ page }) => {
    const { email, password } = await createFractalAdmin('RECRUITER');
    await page.goto('/admin/login');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  });
});
