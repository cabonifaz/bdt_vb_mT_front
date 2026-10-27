import { test, expect } from '@playwright/test';
import { API } from './helpers';

test.describe('Tenant Fractal: marca e idioma', () => {
  test('login muestra logo, nombre y colores configurados por Fractal', async ({ page, request }) => {
    // los colores los configura el admin del tenant: se comparan con el branding vigente
    const b = await (await request.get(`${API}/api/v1/public/tenants/fractal`)).json();
    await page.goto('/fractal/login');
    const logo = page.getByTestId('tenant-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('src', b.logoUrl);
    const css = (v: string) => page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim().toUpperCase(), v);
    await expect.poll(() => css('--brand-primary')).toBe(b.colorPrimary.toUpperCase());
    expect(await css('--brand-secondary')).toBe(b.colorSecondary.toUpperCase());
    expect(await css('--brand-accent')).toBe(b.colorAccent.toUpperCase());
    await expect(page).toHaveTitle(b.displayName);
    const hex = b.colorPrimary.replace('#', '');
    const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
    await expect(page.getByRole('button', { name: 'Ingresar' })).toHaveCSS('background-color', rgb);
  });

  test('la raíz redirige al login de Fractal', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/fractal\/login$/);
  });

  test('tenant inexistente muestra 404', async ({ page }) => {
    await page.goto('/no-existe-xyz/login');
    await expect(page).toHaveURL(/\/404$/);
  });

  test('cambia a inglés y lo recuerda', async ({ page }) => {
    await page.goto('/fractal/login');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: 'ES' }).click();
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  });
});
