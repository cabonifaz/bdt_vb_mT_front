import { test, expect } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

// PNG 1×1 para la cabecera de la plantilla
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('CV con la marca del tenant: plantilla, español, inglés (IA) y original', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const id = crypto.randomUUID();
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: {
    id, firstName: 'Vera', lastName: `Cv${Date.now()}`, headline: 'Arquitecta de software', summary: 'Diseño de soluciones en la nube.' } })).status()).toBe(201);
  expect((await admin.ctx.put(`/api/v1/tenant/talents/${id}/experiences`, { headers: H, data: {
    id: crypto.randomUUID(), company: 'Banco Andino', position: 'Arquitecta', startDate: '2020-01-01', isCurrent: true, functions: 'Diseño de microservicios' } })).ok()).toBeTruthy();

  // la plantilla es del tenant compartido: se restaura al terminar
  await uiLogin(page, 'fractal', admin.email, admin.password);

  // plantilla en Marca y colores: cabecera, texto del pie y ejemplo
  await page.goto('/fractal/marca');
  const card = page.getByTestId('cv-template');
  await card.getByTestId('cv_header-input').setInputFiles({ name: 'cabecera.png', mimeType: 'image/png', buffer: PNG });
  await expect(card.locator('img.cv-tpl-img')).toBeVisible();
  await card.getByLabel('Texto del pie').fill('Fractal · Confidencial');
  await card.getByTestId('cv-template-save').click();
  await expect(page.getByText('Plantilla de CV guardada.')).toBeVisible();
  await page.getByTestId('cv-sample').click();
  await expect(page.getByTestId('cv-sample-frame')).toBeVisible({ timeout: 20000 });
  await page.getByRole('dialog', { name: 'CV de ejemplo' }).getByRole('button', { name: 'Cerrar' }).click();

  // ficha: generar en español y guardarlo en los archivos del talento
  await page.goto(`/fractal/talentos/${id}`);
  await page.getByTestId('cv-generate').click();
  const dlg = page.getByRole('dialog', { name: /CV de Vera/ });
  await expect(dlg.getByTestId('cv-frame')).toBeVisible({ timeout: 20000 });
  await expect(dlg.getByTestId('cv-download')).toHaveAttribute('download', /_CV_ES\.pdf$/);
  await dlg.getByTestId('cv-save').click();
  await expect(page.getByText('CV guardado en los archivos del talento.')).toBeVisible();

  // inglés: los textos llegan traducidos por el backend (IA simulada en la prueba)
  let asked = '';
  await page.route(`**/api/v1/tenant/talents/${id}/cv/translate`, async (r) => {
    asked = r.request().postData() ?? '';
    await r.fulfill({ json: { headline: 'Software architect', summary: 'Cloud solution design.', experiences: [], educations: [] } });
  });
  await dlg.getByTestId('cv-en').click();
  await expect(dlg.getByTestId('cv-download')).toHaveAttribute('download', /_CV_EN\.pdf$/, { timeout: 20000 });
  expect(asked).toContain('"lang":"en"');

  // original: sin CV cargado se avisa
  await dlg.getByTestId('cv-original').click();
  await expect(dlg.getByText('Este talento no tiene un CV original cargado.')).toBeVisible();

  expect((await admin.ctx.put('/api/v1/tenant/branding/cv', { headers: H, data: { footerText: '', showPhoto: false, clearHeader: true, clearFooter: true } })).ok()).toBeTruthy();
});

test('CV: el endpoint de traducción exige permiso y valida el idioma', async () => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const id = crypto.randomUUID();
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id, firstName: 'Lio', lastName: 'Perm' } })).status()).toBe(201);
  expect((await admin.ctx.post(`/api/v1/tenant/talents/${id}/cv/translate`, { headers: H, data: { lang: 'fr' } })).status()).toBe(422);
  expect((await admin.ctx.post(`/api/v1/tenant/talents/${id}/cv/translate`, { data: { lang: 'en' } })).status()).toBe(401);
  expect((await admin.ctx.post(`/api/v1/tenant/talents/${crypto.randomUUID()}/cv/translate`, { headers: H, data: { lang: 'en' } })).status()).toBe(404);
});
