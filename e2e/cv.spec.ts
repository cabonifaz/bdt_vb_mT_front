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
  await expect(page.getByText('Plantilla de CV guardada.').last()).toBeVisible();
  await page.getByTestId('cv-sample').click();
  await expect(page.getByTestId('cv-sample-frame')).toBeVisible({ timeout: 20000 });
  await page.getByRole('dialog', { name: 'CV de ejemplo' }).getByRole('button', { name: 'Cerrar' }).click();

  // inglés: los textos llegan traducidos por el backend (IA simulada en la prueba); se cuenta cada traducción
  let translations = 0;
  let asked = '';
  await page.route(`**/api/v1/tenant/talents/${id}/cv/translate`, async (r) => {
    translations++;
    asked = r.request().postData() ?? '';
    await r.fulfill({ json: { headline: 'Software architect', summary: 'Cloud solution design.', experiences: [], educations: [] } });
  });
  const files = async () => (await (await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: H })).json()).files as { category: string }[];

  // ficha: al generar en español se guarda solo en los archivos del talento
  await page.goto(`/fractal/talentos/${id}`);
  await page.getByTestId('cv-generate').click();
  const dlg = page.getByRole('dialog', { name: /CV de Vera/ });
  await expect(dlg.getByTestId('cv-frame')).toBeVisible({ timeout: 20000 });
  await expect(dlg.getByTestId('cv-download')).toHaveAttribute('download', /_CV_ES\.pdf$/);
  await expect(dlg.getByTestId('cv-status')).toContainText('se reutiliza');
  await expect.poll(async () => (await files()).filter((f) => f.category === 'CV_TENANT_ES').length).toBe(1);

  await dlg.getByTestId('cv-en').click();
  await expect(dlg.getByTestId('cv-download')).toHaveAttribute('download', /_CV_EN\.pdf$/, { timeout: 20000 });
  await expect(dlg.getByTestId('cv-status')).toContainText('Guardado el');
  expect(asked).toContain('"lang":"en"');
  expect(translations).toBe(1);

  // al volver a abrir se usan los CV guardados: no se genera ni se traduce otra vez
  await dlg.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByTestId('cv-generate').click();
  await expect(dlg.getByTestId('cv-status')).toContainText('se reutiliza', { timeout: 20000 });
  await dlg.getByTestId('cv-en').click();
  await expect(dlg.getByTestId('cv-frame')).toBeVisible({ timeout: 20000 });
  await expect(dlg.getByTestId('cv-status')).toContainText('Guardado el');
  expect(translations).toBe(1);

  // "Regenerar" vuelve a traducir y reemplaza el CV guardado (no se acumulan archivos)
  await dlg.getByTestId('cv-regenerate').click();
  await expect.poll(() => translations).toBe(2);
  await expect(dlg.getByTestId('cv-frame')).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await files()).filter((f) => f.category === 'CV_TENANT_EN').length).toBe(1);

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
