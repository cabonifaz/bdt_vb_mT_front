import { test, expect } from '@playwright/test';

test.describe('Tenant Fractal: marca e idioma', () => {
  test('login muestra logo y colores de Fractal', async ({ page }) => {
    await page.goto('/fractal/login');
    const logo = page.getByTestId('tenant-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('src', '/tenants/fractal/logo.png');
    const css = (v: string) => page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim().toUpperCase(), v);
    expect(await css('--brand-primary')).toBe('#009688');
    expect(await css('--brand-secondary')).toBe('#0B85C3');
    expect(await css('--brand-accent')).toBe('#FAAB34');
    await expect(page).toHaveTitle('Fractal - Banco de talentos');
    await expect(page.getByRole('button', { name: 'Ingresar' })).toHaveCSS('background-color', 'rgb(0, 150, 136)');
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
