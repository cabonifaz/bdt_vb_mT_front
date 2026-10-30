import { test, expect, type Page } from '@playwright/test';
import { SA_EMAIL, SA_PASSWORD, createFractalAdmin, uiLoginOk } from './helpers';

test.describe.configure({ timeout: 180_000 });

// PNG de 1x1 para adjuntar
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function saLogin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill(SA_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(SA_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/admin') && !u.pathname.endsWith('/login'));
}

test('guía de la pantalla: se abre con "?" y recorre sus pasos', async ({ page }) => {
  const rec = await createFractalAdmin('RECRUITER');
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', rec.email, rec.password);
  await page.goto('/fractal/requerimientos');
  await expect(page.getByTestId('rq-scopes')).toBeVisible();
  await expect(page.getByTestId('tour')).toHaveCount(0); // en navegadores automatizados no se abre sola
  await page.getByTestId('help-button').click();
  const tour = page.getByTestId('tour');
  await expect(tour.getByRole('dialog')).toContainText('Vistas del tablero');
  await expect(tour.getByRole('dialog')).toContainText('Ejemplo:');
  // el reclutador no crea RQ: ese paso se omite
  while (await tour.getByTestId('tour-next').textContent() !== 'Entendido') await tour.getByTestId('tour-next').click();
  await expect(tour.getByRole('dialog')).not.toContainText('Nuevo requerimiento');
  await tour.getByTestId('tour-next').click();
  await expect(tour).toHaveCount(0);
});

test('soporte: el usuario reporta desde una pantalla con imagen, el Super Admin responde y cada uno es notificado', async ({ page, browser }) => {
  const rec = await createFractalAdmin('RECRUITER');
  const title = `No guarda el RQ ${Date.now()}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', rec.email, rec.password);
  await page.goto('/fractal/requerimientos');
  await expect(page.getByTestId('rq-scopes')).toBeVisible();

  await page.getByTestId('report-button').click();
  const dlg = page.getByRole('dialog', { name: 'Reportar o sugerir' });
  await expect(dlg.getByTestId('support-origin')).toContainText('Requerimientos'); // de qué pantalla viene
  await expect(dlg.getByTestId('support-send')).toBeDisabled();
  await dlg.getByTestId('support-title').fill(title);
  await dlg.getByTestId('support-body').fill('Al guardar sale un error.');
  await dlg.getByTestId('support-ref').fill('RQ-2026-0001');
  await dlg.getByTestId('support-file').setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: PNG });
  await expect(dlg.getByTestId('support-thumbs').locator('li.ok')).toHaveCount(1);
  await dlg.getByTestId('support-send').click();
  await expect(page).toHaveURL(/\/fractal\/soporte\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('support-status')).toHaveText('Abierta');
  await expect(page.getByTestId('support-origin-detail')).toContainText('/fractal/requerimientos');
  await expect(page.getByTestId('support-attachment')).toHaveCount(1);
  const ticketPath = new URL(page.url()).pathname;

  // Super Admin: notificación, bandeja y respuesta
  const sa = await (await browser.newContext()).newPage();
  await sa.setViewportSize({ width: 1440, height: 900 });
  await saLogin(sa);
  await sa.getByTestId('notif-bell').click();
  await sa.getByTestId('notif-item').filter({ hasText: title }).click();
  await expect(sa).toHaveURL(/\/admin\/soporte\/[0-9a-f-]{36}$/);
  await expect(sa.getByTestId('support-origin-detail')).toContainText('Fractal');
  await sa.getByTestId('support-reply-body').fill('Corregido, prueba de nuevo por favor.');
  await sa.getByTestId('support-reply-status').selectOption('ANSWERED');
  await sa.getByTestId('support-reply-send').click();
  await expect(sa.getByTestId('support-status').first()).toHaveText('Respondida');

  // el usuario recibe la respuesta
  await page.goto('/fractal/requerimientos');
  await page.getByTestId('notif-bell').click();
  await page.getByTestId('notif-item').filter({ hasText: title }).click();
  await expect(page).toHaveURL(new RegExp(`${ticketPath}$`));
  await expect(page.getByTestId('support-message')).toHaveCount(2);
  await expect(page.getByTestId('support-thread')).toContainText('Equipo de la plataforma');
  await expect(page.getByTestId('support-status').first()).toHaveText('Respondida');

  // novedad para todos
  await sa.goto('/admin/novedades');
  const news = `Novedad e2e ${Date.now()}`;
  await sa.getByTestId('release-new').click();
  await sa.getByTestId('release-title').fill(news);
  await sa.getByTestId('release-body').fill('Ahora puedes reportar incidencias desde cualquier pantalla.');
  await sa.getByTestId('release-save').click();
  await expect(sa.getByTestId('release-item').first()).toContainText(news);
  await page.goto('/fractal/novedades');
  await expect(page.getByTestId('release-item').first()).toContainText(news);
});
