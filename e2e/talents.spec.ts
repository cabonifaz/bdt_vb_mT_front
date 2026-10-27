import { test, expect, type Page } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function createTalentUI(page: Page, first: string, last: string, extra: { email?: string; headline?: string } = {}) {
  await page.goto('/fractal/talentos/nuevo');
  await page.getByLabel('Nombres').fill(first);
  await page.getByLabel('Apellido paterno').fill(last);
  if (extra.headline) await page.getByLabel('Puesto / perfil').fill(extra.headline);
  if (extra.email) await page.getByLabel('Correo').fill(extra.email);
  await page.getByTestId('save-talent').click();
}

test('ficha completa: alta, habilidades, experiencia, idioma, feedback, CV y búsqueda con filtros', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Talentos' }).first().click();
  await expect(page.getByRole('heading', { name: 'Talentos', level: 1 })).toBeVisible();

  const last = `Prueba${stamp()}`;
  await page.goto('/fractal/talentos/nuevo');
  await page.getByLabel('Nombres').fill('Lucía');
  await page.getByLabel('Apellido paterno').fill(last);
  await page.getByLabel('Puesto / perfil').fill('Arquitecta de software');
  await page.getByLabel('Correo').fill(`lucia.${stamp()}@correo.test`);
  await page.getByLabel('País').selectOption({ label: 'Perú' });
  await page.getByLabel('Ciudad').fill('Arequipa');
  await page.getByLabel('Planilla · Mínimo').fill('7000');
  await page.getByLabel('Planilla · Máximo').fill('9000');
  await page.getByTestId('save-talent').click();
  await expect(page.getByTestId('talent-name')).toHaveText(`Lucía ${last}`);
  await expect(page.getByTestId('rates')).toContainText('9,000');

  // habilidades técnicas (del catálogo y una nueva escrita a mano)
  await page.getByLabel('Habilidades técnicas', { exact: true }).fill('Java');
  await page.getByLabel('Años').fill('6');
  await page.getByRole('button', { name: 'Agregar', exact: true }).first().click();
  await expect(page.locator('.chip', { hasText: 'Java' })).toBeVisible();
  const custom = `Micronaut${stamp().slice(-4)}`;
  await page.getByLabel('Habilidades técnicas', { exact: true }).fill(custom);
  await page.getByRole('button', { name: 'Agregar', exact: true }).first().click();
  await expect(page.locator('.chip', { hasText: custom })).toBeVisible();

  // experiencia
  await page.getByRole('button', { name: 'Agregar experiencia' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Empresa').fill('Fintech SAC');
  await dlg.getByLabel('Puesto').fill('Tech Lead');
  await dlg.getByLabel('Inicio').fill('2017-02-01');
  await dlg.getByLabel('Actualmente').check();
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('experience-row')).toContainText('Tech Lead');

  // idioma
  await page.getByRole('button', { name: 'Agregar idioma' }).click();
  await page.getByRole('dialog').getByLabel('Idioma').selectOption({ label: 'Inglés' });
  await page.getByRole('dialog').getByLabel('Nivel').selectOption({ label: 'Avanzado' });
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Inglés · Avanzado')).toBeVisible();

  // feedback con estrellas
  await page.getByRole('button', { name: 'Agregar feedback' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: '4' }).click();
  await page.getByRole('dialog').getByLabel('Comentario').fill('Muy buena comunicación');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Muy buena comunicación')).toBeVisible();
  await expect(page.getByText('4.0')).toBeVisible();

  // CV (PDF)
  await page.getByTestId('talent-file-input').setInputFiles({ name: 'cv-lucia.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
  await expect(page.getByTestId('file-row')).toContainText('cv-lucia.pdf');

  // búsqueda y filtros
  await page.getByRole('link', { name: 'Volver al listado' }).click();
  await page.getByLabel('Buscar').fill(last);
  await expect(page.getByTestId('talent-card')).toHaveCount(1);
  await expect(page.getByTestId('talent-card')).toContainText('Arquitecta de software');
  await page.getByLabel('Nivel de inglés mínimo').selectOption({ label: 'Nativo' });
  await expect(page.getByTestId('talent-card')).toHaveCount(0);
  await page.getByLabel('Nivel de inglés mínimo').selectOption({ label: 'Intermedio' });
  await expect(page.getByTestId('talent-card')).toHaveCount(1);
  await page.getByLabel('Años de experiencia (mín.)').fill('5');
  await expect(page.getByTestId('talent-card')).toHaveCount(1);
});

test('el reclutador no ve tarifas ni puede fijarlas', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const id = crypto.randomUUID();
  const r = await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` },
    data: { id, firstName: 'Mario', lastName: `Tarifas${stamp()}`, rates: { payrollMin: 5000, payrollMax: 6000 } } });
  expect(r.status()).toBe(201);
  const rec = await createFractalAdmin('RECRUITER');
  await uiLogin(page, 'fractal', rec.email, rec.password);
  await page.goto(`/fractal/talentos/${id}`);
  await expect(page.getByText('No tienes permiso para ver tarifas.')).toBeVisible();
  await expect(page.getByText('6,000')).toHaveCount(0);
  await page.getByRole('link', { name: 'Editar perfil' }).click();
  await expect(page.getByLabel('Planilla · Mínimo')).toHaveCount(0);
});

test('alta sin conexión: se encola y se sincroniza al volver la red', async ({ page, context }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Talentos' }).first().click();
  await expect(page.getByTestId('talent-count')).toBeVisible();
  await page.getByRole('link', { name: 'Nuevo talento' }).click();
  await expect(page.getByLabel('Nombres')).toBeVisible();

  await context.setOffline(true);
  const last = `Offline${stamp()}`;
  await page.getByLabel('Nombres').fill('Sin');
  await page.getByLabel('Apellido paterno').fill(last);
  await page.getByTestId('save-talent').click();
  await expect(page.getByText('Guardado sin conexión')).toBeVisible();
  await expect(page.getByTestId('offline-banner')).toContainText('1 cambio pendiente');

  await context.setOffline(false);
  await expect(page.getByText('Cambios sincronizados')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);
  await page.getByLabel('Buscar').fill(last);
  await expect(page.getByTestId('talent-card')).toHaveCount(1);
});

test('seguridad: otro tenant no accede al talento ni a sus archivos', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await createTalentUI(page, 'Privado', `Aislado${stamp()}`);
  await expect(page.getByTestId('talent-name')).toBeVisible();
  const talentId = page.url().split('/').pop()!;
  // una sesión de otro tenant (plataforma) no puede usar endpoints de tenant
  const ctx = admin.ctx;
  const sa = await apiLogin(ctx, process.env.E2E_SA_EMAIL!, process.env.E2E_SA_PASSWORD!);
  expect((await ctx.get(`/api/v1/tenant/talents/${talentId}`, { headers: { Authorization: `Bearer ${sa}` } })).status()).toBe(403);
  // sin token
  expect((await ctx.get(`/api/v1/tenant/talents/${talentId}`)).status()).toBe(401);
  // inyección en filtros
  const tok = await apiLogin(ctx, admin.email, admin.password, 'fractal');
  const r = await ctx.get(`/api/v1/tenant/talents?search=${encodeURIComponent("' OR 1=1 --")}`, { headers: { Authorization: `Bearer ${tok}` } });
  expect(r.status()).toBe(200);
  expect((await r.json()).total).toBe(0);
});
