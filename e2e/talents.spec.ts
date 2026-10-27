import { test, expect, type Page } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function openNewTalent(page: Page) {
  await page.getByTestId('new-talent').click();
  await expect(page.getByRole('dialog', { name: 'Nuevo talento' })).toBeVisible();
  return page.getByRole('dialog');
}

test('alta en modal con TODAS las secciones y la ficha se abre sin perder la lista', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Talentos' }).first().click();
  const last = `Completa${stamp()}`;
  const dlg = await openNewTalent(page);

  // Datos
  await dlg.getByLabel('Nombres').fill('Lucía');
  await dlg.getByLabel('Apellido paterno').fill(last);
  await dlg.getByLabel('Puesto / perfil').fill('Arquitecta de software');
  await dlg.getByLabel('Correo').fill(`lucia.${stamp()}@correo.test`);
  await dlg.getByLabel('País').selectOption({ label: 'Perú' });
  await dlg.getByLabel('Ciudad').fill('Arequipa');
  await dlg.getByLabel('Planilla · Mínimo').fill('7000');
  await dlg.getByLabel('Planilla · Máximo').fill('9000');

  // Habilidades técnicas (catálogo + nueva) y blandas
  await dlg.getByTestId('tab-skills').click();
  await dlg.getByLabel('Habilidades técnicas').fill('Java');
  await dlg.getByLabel('Años', { exact: true }).fill('6');
  await dlg.getByTestId('add-tech').click();
  const custom = `Micronaut${stamp().slice(-4)}`;
  await dlg.getByLabel('Habilidades técnicas').fill(custom);
  await dlg.getByTestId('add-tech').click();
  await dlg.getByLabel('Habilidades blandas').fill('Liderazgo');
  await dlg.getByTestId('add-soft').click();
  await expect(dlg.locator('.chip')).toHaveCount(3);

  // Experiencia
  await dlg.getByTestId('tab-experience').click();
  await dlg.getByLabel('Empresa').fill('Fintech SAC');
  await dlg.getByLabel('Puesto').fill('Tech Lead');
  await dlg.getByLabel('Inicio').fill('2017-02-01');
  await dlg.getByLabel('Actualmente').check();
  await dlg.getByTestId('list-add').click();
  await expect(dlg.getByTestId('draft-row')).toContainText('Tech Lead');

  // Educación
  await dlg.getByTestId('tab-education').click();
  await dlg.getByLabel('Institución').fill('UNSA');
  await dlg.getByLabel('Carrera').fill('Ingeniería de Sistemas');
  await dlg.getByLabel('Grado académico').selectOption({ label: 'Título' });
  await dlg.getByTestId('list-add').click();

  // Idiomas
  await dlg.getByTestId('tab-languages').click();
  await dlg.getByLabel('Idioma').selectOption({ label: 'Inglés' });
  await dlg.getByLabel('Nivel').selectOption({ label: 'Avanzado' });
  await dlg.getByTestId('list-add').click();

  // Feedback
  await dlg.getByTestId('tab-feedback').click();
  await dlg.getByRole('radio', { name: '4' }).click();
  await dlg.getByLabel('Comentario').fill('Muy buena comunicación');

  // Archivos
  await dlg.getByTestId('tab-files').click();
  await dlg.getByTestId('editor-file-input').setInputFiles({ name: 'cv-lucia.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
  await expect(dlg.getByText('cv-lucia.pdf')).toBeVisible();

  await dlg.getByTestId('save-talent').click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 });

  // ficha en el panel derecho con todas las secciones
  await expect(page.getByTestId('talent-name')).toHaveText(`Lucía ${last}`);
  await expect(page.getByTestId('rates')).toContainText('9,000');
  await expect(page.locator('.ws-detail .chip', { hasText: 'Java' })).toBeVisible();
  await expect(page.locator('.ws-detail .chip', { hasText: custom })).toBeVisible();
  await expect(page.locator('.ws-detail .chip', { hasText: 'Liderazgo' })).toBeVisible();
  await expect(page.getByTestId('experience-row')).toContainText('Tech Lead');
  await expect(page.locator('.ws-detail')).toContainText('Ingeniería de Sistemas');
  await expect(page.locator('.ws-detail')).toContainText('Inglés · Avanzado');
  await expect(page.locator('.ws-detail')).toContainText('Muy buena comunicación');
  await expect(page.getByTestId('file-row')).toContainText('cv-lucia.pdf');
  // la lista sigue visible junto a la ficha
  await expect(page.getByTestId('talent-card').first()).toBeVisible();
});

test('la lista y los filtros se mantienen al abrir talentos', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.goto('/fractal/talentos');
  await page.getByLabel('Nivel de inglés mínimo').selectOption({ label: 'Intermedio' });
  await page.getByLabel('Años de experiencia (mín.)').fill('3');
  await expect(page).toHaveURL(/englishLevel=INTERMEDIATE.*minYears=3|minYears=3.*englishLevel=INTERMEDIATE/);
  await expect(page.locator('.ws-list')).not.toHaveAttribute('aria-busy', 'true'); // lista ya filtrada
  const cards = page.getByTestId('talent-card');
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(1);

  await cards.nth(0).click();
  const first = await page.getByTestId('talent-name').textContent();
  await expect(page).toHaveURL(/\/talentos\/[0-9a-f-]{36}\?.*englishLevel=INTERMEDIATE/);
  await expect(cards).toHaveCount(total);
  await expect(page.getByLabel('Nivel de inglés mínimo')).toHaveValue('INTERMEDIATE');
  await expect(page.getByLabel('Años de experiencia (mín.)')).toHaveValue('3');
  await expect(cards.nth(0)).toHaveAttribute('aria-current', 'true');

  await cards.nth(1).click();
  await expect(page.getByTestId('talent-name')).not.toHaveText(first!);
  await expect(cards).toHaveCount(total);
  await expect(cards.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('clear-filters')).toContainText('(2)');
});

test('edición en modal: cambia datos y secciones', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const id = crypto.randomUUID();
  const last = `Edicion${stamp()}`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` },
    data: { id, firstName: 'Pedro', lastName: last, headline: 'Dev' } })).status()).toBe(201);
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.goto(`/fractal/talentos/${id}?search=${last}`);
  await expect(page.getByTestId('talent-name')).toHaveText(`Pedro ${last}`);
  await page.getByTestId('edit-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Editar perfil' });
  await dlg.getByLabel('Puesto / perfil').fill('Desarrollador Go');
  await dlg.getByTestId('tab-skills').click();
  await dlg.getByLabel('Habilidades técnicas').fill('Go');
  await dlg.getByLabel('Años', { exact: true }).fill('4');
  await dlg.getByTestId('add-tech').click();
  await dlg.getByTestId('save-talent').click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.ws-detail')).toContainText('Desarrollador Go');
  await expect(page.locator('.ws-detail .chip', { hasText: 'Go' })).toBeVisible();
  await expect(page.getByTestId('talent-card')).toContainText('Desarrollador Go');
});

test('menú lateral: minimizar, ocultar, mostrar por un momento y fijar', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  const sidebar = page.getByTestId('sidebar');
  await expect(sidebar).toHaveAttribute('data-mode', 'expanded');
  await page.getByRole('button', { name: 'Minimizar' }).click();
  await expect(sidebar).toHaveAttribute('data-mode', 'rail');
  await expect(sidebar.getByText('Talentos')).toHaveCount(0); // solo íconos
  await page.reload();
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-mode', 'rail'); // se recuerda
  await page.getByRole('button', { name: 'Ocultar menú' }).click();
  await expect(page.getByTestId('sidebar')).toBeHidden();
  await page.getByTestId('menu-toggle').click(); // se muestra por un momento
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-mode', 'peek');
  await page.getByTestId('sidebar').getByRole('link', { name: 'Talentos' }).click();
  await expect(page.getByTestId('sidebar')).toBeHidden(); // se cierra al navegar
  await page.getByTestId('menu-toggle').click();
  await page.getByRole('button', { name: 'Fijar menú' }).click();
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-mode', 'expanded');
});

test('el reclutador no ve tarifas ni puede fijarlas', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const id = crypto.randomUUID();
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` },
    data: { id, firstName: 'Mario', lastName: `Tarifas${stamp()}`, rates: { payrollMin: 5000, payrollMax: 6000 } } })).status()).toBe(201);
  const rec = await createFractalAdmin('RECRUITER');
  await uiLogin(page, 'fractal', rec.email, rec.password);
  await page.goto(`/fractal/talentos/${id}`);
  await expect(page.getByText('No tienes permiso para ver tarifas.')).toBeVisible();
  await expect(page.getByText('6,000')).toHaveCount(0);
  await page.getByTestId('edit-talent').click();
  await expect(page.getByRole('dialog').getByLabel('Planilla · Mínimo')).toHaveCount(0);
});

test('alta sin conexión: se encola y se sincroniza al volver la red', async ({ page, context }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Talentos' }).first().click();
  await expect(page.getByTestId('talent-count')).toBeVisible();
  const dlg = await openNewTalent(page);
  await context.setOffline(true);
  const last = `Offline${stamp()}`;
  await dlg.getByLabel('Nombres').fill('Sin');
  await dlg.getByLabel('Apellido paterno').fill(last);
  await dlg.getByTestId('tab-skills').click();
  await dlg.getByLabel('Habilidades técnicas').fill('Java');
  await dlg.getByTestId('add-tech').click();
  await dlg.getByTestId('save-talent').click();
  await expect(page.getByText('Guardado sin conexión')).toBeVisible();
  await expect(page.getByTestId('offline-banner')).toContainText('2 cambios pendientes');

  await context.setOffline(false);
  await expect(page.getByText('Cambios sincronizados')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Buscar').fill(last);
  await expect(page.getByTestId('talent-card')).toHaveCount(1);
  await page.getByTestId('talent-card').click();
  await expect(page.locator('.ws-detail .chip', { hasText: 'Java' })).toBeVisible();
});

test('seguridad: otro tenant/plataforma no accede al talento; filtros resisten inyección', async () => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const id = crypto.randomUUID();
  await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` }, data: { id, firstName: 'Privado', lastName: `Aislado${stamp()}` } });
  const sa = await apiLogin(admin.ctx, process.env.E2E_SA_EMAIL!, process.env.E2E_SA_PASSWORD!);
  expect((await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: { Authorization: `Bearer ${sa}` } })).status()).toBe(403);
  expect((await admin.ctx.get(`/api/v1/tenant/talents/${id}`)).status()).toBe(401);
  const r = await admin.ctx.get(`/api/v1/tenant/talents?search=${encodeURIComponent("' OR 1=1 --")}`, { headers: { Authorization: `Bearer ${tok}` } });
  expect(r.status()).toBe(200);
  expect((await r.json()).total).toBe(0);
});
