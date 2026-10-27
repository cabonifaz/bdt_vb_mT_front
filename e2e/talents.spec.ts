import { test, expect, type Page } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin, uiLogout } from './helpers';

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

test('la lista y los filtros se mantienen al abrir talentos y nunca van en la URL', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await expect(page).toHaveURL(/\/fractal\/talentos$/);
  await page.getByTestId('toggle-filters').click();
  await page.getByLabel('Nivel de inglés mínimo').selectOption({ label: 'Intermedio' });
  await page.getByLabel('Años de experiencia (mín.)').fill('3');
  await page.getByLabel('Buscar').fill('a');
  await expect(page.getByTestId('toggle-filters')).toContainText('2');
  await expect(page.locator('.ws-chips')).toContainText('EN ≥ Intermedio');
  await page.waitForTimeout(500);
  await expect(page.locator('.ws-list')).not.toHaveAttribute('aria-busy', 'true');
  const cards = page.getByTestId('talent-card');
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(1);

  await cards.nth(0).click();
  const first = await page.getByTestId('talent-name').textContent();
  // solo el uuid opaco del talento va en la URL: ni filtros ni términos de búsqueda
  await expect(page).toHaveURL(/\/fractal\/talentos\/[0-9a-f-]{36}$/);
  expect(page.url()).not.toMatch(/englishLevel|minYears|search|INTERMEDIATE/);
  await expect(cards).toHaveCount(total);
  await expect(page.getByLabel('Nivel de inglés mínimo')).toHaveValue('INTERMEDIATE');
  await expect(page.getByLabel('Buscar')).toHaveValue('a');
  await expect(cards.nth(0)).toHaveAttribute('aria-current', 'true');

  await cards.nth(1).click();
  await expect(page.getByTestId('talent-name')).not.toHaveText(first!);
  await expect(cards).toHaveCount(total);
  // los filtros siguen al ir a otro módulo y volver
  await page.getByTestId('sidebar').getByRole('link', { name: 'Usuarios' }).click();
  await page.getByTestId('sidebar').getByRole('link', { name: 'Talentos' }).click();
  await expect(page.locator('.ws-chips')).toContainText('EN ≥ Intermedio');
  // y se descartan al cerrar sesión
  await uiLogout(page);
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await expect(page.locator('.ws-chips')).toHaveCount(0);
  await expect(page.getByLabel('Buscar')).toHaveValue('');
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
  await expect(page.getByTestId('talent-card').filter({ hasText: last })).toContainText('Desarrollador Go');
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
  await expect(page.getByTestId('talent-name')).toBeVisible();
  await expect(page.getByTestId('rates')).toHaveCount(0); // sin permiso no se muestra la línea de tarifas
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
  const r = await admin.ctx.post('/api/v1/tenant/talents/search', { headers: { Authorization: `Bearer ${tok}` }, data: { search: "' OR 1=1 --" } });
  // los filtros ya no se aceptan en la URL
  expect((await admin.ctx.get('/api/v1/tenant/talents?search=x', { headers: { Authorization: `Bearer ${tok}` } })).status()).toBe(405);
  expect(r.status()).toBe(200);
  expect((await r.json()).total).toBe(0);
});

test('la lista muestra el nombre completo del talento (sin recortar con puntos)', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const last = `Montenegro${stamp()}`;
  const full = `María Fernanda Alejandra ${last} Villavicencio`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` },
    data: { id: crypto.randomUUID(), firstName: 'María Fernanda Alejandra', lastName: last, secondLastName: 'Villavicencio' } })).status()).toBe(201);
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.getByLabel('Buscar').fill(last);
  const name = page.getByTestId('talent-row-name').filter({ hasText: last });
  await expect(name).toHaveText(full);
  // no se recorta: el contenido cabe completo (en varias líneas si hace falta)
  const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth || getComputedStyle(el).textOverflow === 'ellipsis');
  expect(clipped).toBe(false);
  expect(await name.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(20); // ocupa más de una línea
});

test('contacto en íconos: el dato solo se ve al hacer clic; tarifas en una línea', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const id = crypto.randomUUID();
  const email = `contacto.${stamp()}@correo.test`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` },
    data: { id, firstName: 'Rosa', lastName: `Contacto${stamp()}`, email, phone: '999888777', rates: { payrollMin: 4000, payrollMax: 5000 } } })).status()).toBe(201);
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.goto(`/fractal/talentos/${id}`);
  await expect(page.getByTestId('talent-name')).toBeVisible();
  await expect(page.getByText(email)).toHaveCount(0);           // oculto hasta hacer clic
  await expect(page.getByTestId('contact-github')).toBeDisabled(); // sin dato: atenuado
  await page.getByTestId('contact-email').click();
  await expect(page.getByTestId('contact-pop-email')).toContainText(email);
  await expect(page.getByTestId('contact-pop-email').getByRole('link', { name: 'Escribir' })).toHaveAttribute('href', `mailto:${email}`);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('contact-pop-email')).toHaveCount(0);
  await page.getByTestId('contact-phone').click();
  await expect(page.getByTestId('contact-pop-phone')).toContainText('999888777');
  await expect(page.getByTestId('rates')).toContainText('4,000 – 5,000');
});

test('ficha: disponibilidad y equipo propio con un clic, % de perfil completo y moneda', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const id = crypto.randomUUID();
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: { Authorization: `Bearer ${tok}` },
    data: { id, firstName: 'Iris', lastName: `Rapida${stamp()}` } })).status()).toBe(201);
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.goto(`/fractal/talentos/${id}`);
  const meter = page.getByTestId('profile-meter');
  await expect(meter).toBeVisible();
  const pct0 = Number(await meter.getAttribute('data-pct'));
  expect(pct0).toBeLessThan(20);
  await expect(meter).toHaveAttribute('title', /Falta: .*disponibilidad/);

  // disponibilidad: clic en el chip y se elige la opción (sin abrir el editor)
  await page.getByTestId('availability-chip').click();
  await page.getByRole('menuitemradio', { name: 'Inmediata' }).click();
  await expect(page.getByTestId('availability-chip')).toHaveText('Inmediata');
  // equipo propio: cada clic alterna
  await page.getByTestId('equipment-chip').click();
  await expect(page.getByTestId('equipment-chip')).toHaveText('Equipo propio');
  await page.getByTestId('equipment-chip').click();
  await expect(page.getByTestId('equipment-chip')).toHaveText('Sin equipo');
  await expect.poll(async () => Number(await meter.getAttribute('data-pct'))).toBeGreaterThan(pct0);

  await page.reload();
  await expect(page.getByTestId('availability-chip')).toHaveText('Inmediata');
  await expect(page.getByTestId('equipment-chip')).toHaveText('Sin equipo');

  // editor: combo de disponibilidad, barra de progreso en vivo y moneda por defecto
  await page.getByTestId('edit-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Editar perfil' });
  const bar = dlg.getByTestId('profile-meter');
  await expect(bar).toBeVisible();
  await expect(dlg.getByLabel('Disponibilidad')).toHaveValue(/.+/);
  const before = Number(await bar.getAttribute('data-pct'));
  await dlg.getByLabel('Planilla · Mínimo').fill('7000');
  await expect(dlg.getByLabel('Planilla · Moneda')).not.toHaveValue('');
  await dlg.getByLabel('Puesto / perfil').fill('Analista QA');
  await expect.poll(async () => Number(await bar.getAttribute('data-pct'))).toBeGreaterThan(before);
  await page.getByTestId('save-talent').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('rates')).toContainText(/PEN|USD/);
});
