import { test, expect } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

// Centro de notificaciones: el alta y la actualización de un talento notifican a los demás usuarios del tenant.
test('notificaciones: alta y actualización de talento, ir a la ficha, marcar leídas y preferencias', async ({ page }) => {
  const author = await createFractalAdmin();
  const reader = await createFractalAdmin('RECRUITER');
  const tok = await apiLogin(author.ctx, author.email, author.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };

  await uiLogin(page, 'fractal', reader.email, reader.password);
  const bell = page.getByTestId('notif-bell');
  await expect(bell).toBeVisible();
  await expect(page.getByTestId('notif-count')).toHaveCount(0); // usuario nuevo: parte de cero

  // otro usuario crea y luego edita un talento (la edición se agrupa con el alta)
  const id = crypto.randomUUID();
  const last = `Notif${Date.now()}`;
  expect((await author.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id, firstName: 'Rosa', lastName: last, headline: 'Data Engineer' } })).status()).toBe(201);
  expect((await author.ctx.put(`/api/v1/tenant/talents/${id}`, { headers: H, data: { id, firstName: 'Rosa', lastName: last, headline: 'Data Lead' } })).status()).toBe(200);
  const id2 = crypto.randomUUID();
  expect((await author.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id: id2, firstName: 'Iván', lastName: last } })).status()).toBe(201);

  // la campana se actualiza sola cada minuto (y al instante si llega un push); en la prueba se recarga
  await page.reload();
  await expect(page.getByTestId('notif-count')).toHaveText('2', { timeout: 20000 });
  await bell.click();
  const panel = page.getByTestId('notif-panel');
  const rosa = panel.getByTestId('notif-item').filter({ hasText: `Rosa ${last}` });
  await expect(rosa).toContainText('registró al talento');
  await expect(rosa).toContainText('(2 cambios)');
  await expect(rosa).toContainText('Data Lead');

  // ir a la ficha la marca como leída
  await rosa.click();
  await expect(page).toHaveURL(new RegExp(`/fractal/talentos/${id}$`));
  await expect(page.getByTestId('notif-count')).toHaveText('1');

  // solo no leídas y marcar todas
  await bell.click();
  await panel.getByRole('tab', { name: /No leídas/ }).click();
  await expect(panel.getByTestId('notif-item')).toHaveCount(1);
  await expect(panel.getByTestId('notif-item')).toContainText(`Iván ${last}`);
  await page.getByTestId('notif-read-all').click();
  await expect(page.getByTestId('notif-count')).toHaveCount(0);
  await expect(panel.getByText('No tienes notificaciones sin leer.')).toBeVisible();

  // preferencias: silenciar las altas en la app
  await page.getByTestId('notif-prefs').click();
  const prefs = page.getByTestId('notif-prefs-modal');
  await expect(prefs.getByText('Notificaciones del sistema')).toBeVisible();
  await prefs.getByTestId('pref-TALENT_CREATED-inApp').uncheck();
  await expect.poll(async () => (await (await reader.ctx.get('/api/v1/tenant/notifications/prefs', { headers: { Authorization: `Bearer ${await apiLogin(reader.ctx, reader.email, reader.password, 'fractal')}` } })).json())
    .types.find((t: { type: string }) => t.type === 'TALENT_CREATED').inApp).toBe(false);
  await page.getByRole('dialog', { name: 'Preferencias de notificaciones' }).getByRole('button', { name: 'Cerrar' }).click();
  const id3 = crypto.randomUUID();
  expect((await author.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id: id3, firstName: 'Silencio', lastName: last } })).status()).toBe(201);
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('notif-count')).toHaveCount(0);
});

test('el Super Admin tiene su propia bandeja (soporte y novedades de la plataforma)', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill(process.env.E2E_SA_EMAIL ?? '');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_SA_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('notif-bell')).toHaveCount(1);
  await expect(page.getByTestId('report-button')).toHaveCount(0); // el Super Admin atiende, no reporta
});
