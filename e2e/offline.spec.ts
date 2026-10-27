import { test, expect } from '@playwright/test';
import { createFractalAdmin, uiLogin } from './helpers';

test('sin conexión se avisa al usuario y se sigue navegando con los datos cargados', async ({ page, context }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByRole('cell', { name: admin.email }).first()).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByTestId('offline-banner')).toContainText('Sin conexión');
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByRole('cell', { name: admin.email }).first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);
});

test('el branding queda en caché local (IndexedDB) para abrir sin red', async ({ page }) => {
  await page.goto('/fractal/login');
  await expect(page.getByTestId('tenant-logo')).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise<string | null>((resolve) => {
    const req = indexedDB.open('bdt-cache');
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) return resolve(null);
      const get = db.transaction('kv', 'readonly').objectStore('kv').get('branding:fractal');
      get.onsuccess = () => resolve(get.result?.colorPrimary ?? null);
    };
    req.onerror = () => resolve(null);
  }))).toBe('#009688');
});
