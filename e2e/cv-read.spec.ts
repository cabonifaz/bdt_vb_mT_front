import { test, expect, type Page } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

// Lectura de CV con IA para el alta: el texto se extrae del PDF en el navegador y el backend lo estructura con OpenAI.
// En la prueba la IA se simula (no consume tokens); se verifica que el texto del PDF llegue al backend.
// apellido único por prueba (los dígitos del correo): un nombre completo repetido cuenta como talento existente
const read = (email: string) => ({
  firstName: 'Lucía', lastName: `Fernández${email.replace(/\D/g, '')}`, secondLastName: 'Prado', docNumber: '', email, phoneCode: '51', phoneNumber: '987654321',
  countryCode: 'PE', city: 'Lima', linkedin: 'https://linkedin.com/in/luciafp', github: '', headline: 'Analista Programadora',
  summary: 'Ingeniera de software con 10 años de experiencia en sistemas financieros y equipos ágiles.',
  techSkills: [{ name: 'Java', years: 8, yearsKnown: true }, { name: 'Playwright', years: 2, yearsKnown: true }], softSkills: ['Trabajo en equipo'],
  experiences: [{ company: 'Empresa Ejemplo SAC', position: 'Analista Programadora', functions: 'Desarrollo de microservicios.', startDate: '2020-03-01', endDate: '', current: true },
    { company: 'Sin fecha SAC', position: 'Practicante', functions: '', startDate: '', endDate: '', current: false }],
  educations: [{ institution: 'Universidad Ejemplo', career: 'Ingeniería de Sistemas', grade: 'BACHELOR', startDate: '2008-01-01', endDate: '2013-01-01', current: false, yearOnly: true }],
  languages: [{ code: 'EN', name: 'Inglés', level: 'ADVANCED' }, { code: 'XX', name: 'Klingon', level: 'BASIC' }],
});

async function mockRead(page: Page, email: string) {
  const sent: string[] = [];
  await page.route('**/api/v1/tenant/talents/cv/read', async (r) => {
    sent.push(r.request().postDataJSON().text);
    await r.fulfill({ json: read(email) });
  });
  return sent;
}

test('alta de talento: "Leer CV con IA" completa el formulario y adjunta el PDF', async ({ page }) => {
  const admin = await createFractalAdmin();
  const email = `lucia.${Date.now()}@correo.pe`;
  await uiLogin(page, 'fractal', admin.email, admin.password);
  const sent = await mockRead(page, email);
  await page.getByTestId('new-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Nuevo talento' });

  // solo PDF
  await dlg.getByTestId('cv-read-input').setInputFiles({ name: 'cv.docx', mimeType: 'application/msword', buffer: Buffer.from('x') });
  await expect(page.getByText('El CV debe ser un archivo PDF.').last()).toBeVisible();

  await dlg.getByLabel('Nombres').fill('Ya escrito'); // lo que escribió el usuario no se pisa
  await dlg.getByTestId('cv-read-input').setInputFiles('e2e/fixtures/cv-sample.pdf');
  await expect(page.getByText(/Datos del CV cargados/).last()).toBeVisible({ timeout: 20000 });
  expect(sent[0]).toContain('Lucía Fernández Prado');
  expect(sent[0]).toContain('Experiencia laboral');

  await expect(dlg.getByLabel('Nombres')).toHaveValue('Ya escrito');
  await expect(dlg.getByLabel('Apellido paterno')).toHaveValue(/^Fernández\d+$/);
  await expect(dlg.getByLabel('Correo')).toHaveValue(email);
  await expect(dlg.getByLabel('Celular')).toHaveValue('+51 987654321');
  await expect(dlg.getByTestId('tab-experience')).toContainText('1'); // la experiencia sin fecha de inicio se omite
  await expect(dlg.getByTestId('tab-languages')).toContainText('1'); // idioma desconocido se omite
  await expect(dlg.getByTestId('tab-skills')).toContainText('3');
  await dlg.getByTestId('tab-files').click();
  await expect(dlg.getByText('cv-sample.pdf')).toBeVisible();

  await dlg.getByTestId('save-talent').click();
  await expect(page).toHaveURL(/\/fractal\/talentos\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const id = page.url().split('/').pop()!;
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const x = await (await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  expect(x.firstName).toBe('Ya escrito');
  expect(x.experiences).toHaveLength(1);
  expect(x.educations).toHaveLength(1);
  expect(x.languages).toHaveLength(1);
  expect(x.techSkills.length).toBe(2);
  expect(x.files.some((f: { category: string }) => f.category === 'CV')).toBeTruthy();

  // ficha: la experiencia se ve recogida y las funciones se despliegan con un clic
  const exp = page.getByTestId('experience-row').filter({ hasText: 'Analista Programadora' });
  await expect(exp.getByTestId('experience-functions')).toHaveCount(0);
  await exp.getByTestId('experience-toggle').click();
  await expect(exp.getByTestId('experience-functions')).toHaveText('Desarrollo de microservicios.');
  await exp.getByTestId('experience-toggle').click();
  await expect(exp.getByTestId('experience-functions')).toHaveCount(0);
});

test('carga rápida con CV: se revisa identidad y contacto y se guarda todo lo demás', async ({ page }) => {
  const admin = await createFractalAdmin();
  const email = `rapida.${Date.now()}@correo.pe`;
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.route('**/api/v1/tenant/talents/cv/read', (r) => r.fulfill({ json: { ...read(email), phoneCode: '', phoneNumber: '' } }));
  await page.getByTestId('quick-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Carga rápida con CV' });
  await expect(dlg.getByTestId('quick-create')).toBeDisabled();
  await dlg.getByTestId('quick-file').setInputFiles('e2e/fixtures/cv-sample.pdf');
  await dlg.getByTestId('quick-analyze').click();
  await expect(dlg.getByTestId('quick-summary')).toContainText('1 experiencia, 1 estudio, 3 habilidades, 1 idioma', { timeout: 20000 });
  await expect(dlg.getByText('El CV no traía celular')).toBeVisible();
  await expect(dlg.getByLabel('Nombres')).toHaveValue('Lucía');
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect(dlg.getByTestId('quick-create')).toBeInViewport();
  await expect(dlg.getByRole('heading', { name: 'Carga rápida con CV' })).toBeInViewport();

  await dlg.getByTestId('quick-create').click();
  await expect(dlg.getByText('Obligatorio')).toBeVisible(); // falta el celular
  await dlg.getByLabel('Celular').fill('+51 912345678');
  await dlg.getByTestId('quick-create').click();
  await expect(page).toHaveURL(/\/fractal\/talentos\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await expect(page.getByText('Talento creado desde su CV.').last()).toBeVisible();

  const id = page.url().split('/').pop()!;
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const x = await (await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  expect(x).toMatchObject({ firstName: 'Lucía', lastName: expect.stringMatching(/^Fernández\d+$/), email, phone: '+51 912345678', city: 'Lima', linkedinUrl: 'https://linkedin.com/in/luciafp' });
  expect(x.summary).toContain('Ingeniera de software');
  expect(x.experiences).toHaveLength(1);
  expect(x.educations).toHaveLength(1);
  expect(x.softSkills).toHaveLength(1);
  expect(x.files.filter((f: { category: string }) => f.category === 'CV')).toHaveLength(1);
});

test('lectura de CV: el backend rechaza un PDF sin texto y exige permiso', async () => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const res = await admin.ctx.post('/api/v1/tenant/talents/cv/read', { headers: { Authorization: `Bearer ${tok}` }, data: { text: 'escaneo' } });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe('CV_NO_TEXT');
  expect((await admin.ctx.post('/api/v1/tenant/talents/cv/read', { data: { text: 'x'.repeat(100) } })).status()).toBe(401);
  const viewer = await createFractalAdmin('VIEWER').catch(() => null);
  if (viewer) {
    const vt = await apiLogin(viewer.ctx, viewer.email, viewer.password, 'fractal');
    expect((await viewer.ctx.post('/api/v1/tenant/talents/cv/read', { headers: { Authorization: `Bearer ${vt}` }, data: { text: 'x'.repeat(100) } })).status()).toBe(403);
  }
});

test('editar talento: releer el CV agrega lo nuevo, actualiza años de tecnologías y deja el PDF como CV vigente', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const id = crypto.randomUUID();
  const email = `relee.${Date.now()}@correo.pe`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id, firstName: 'Lucía', lastName: `Fernández${Date.now()}`, email, phone: '+51 900000000' } })).status()).toBe(201);
  for (const [label, years] of [['Java', 2], ['Kotlin', 5]] as const) {
    expect((await admin.ctx.put(`/api/v1/tenant/talents/${id}/tech-skills`, { headers: H, data: { id: crypto.randomUUID(), label, years } })).ok()).toBeTruthy();
  }
  expect((await admin.ctx.put(`/api/v1/tenant/talents/${id}/experiences`, { headers: H, data: {
    id: crypto.randomUUID(), company: 'Empresa Ejemplo SAC', position: 'Analista', startDate: '2020-03-01', isCurrent: true } })).ok()).toBeTruthy();

  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.route('**/api/v1/tenant/talents/cv/read', (r) => r.fulfill({ json: { ...read('otro@correo.pe'),
    techSkills: [{ name: 'Java', years: 6, yearsKnown: true }, { name: 'Kotlin', years: 1, yearsKnown: false }, { name: 'Go', years: 1, yearsKnown: false }] } }));
  await page.goto(`/fractal/talentos/${id}`);
  await page.getByTestId('edit-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Editar perfil' });
  await expect(dlg.getByTestId('cv-read')).toHaveText('Releer CV con IA');
  await dlg.getByTestId('cv-read-input').setInputFiles('e2e/fixtures/cv-sample.pdf');
  await expect(page.getByText(/años actualizados en 1 tecnología/).last()).toBeVisible({ timeout: 20000 });
  await expect(dlg.getByLabel('Correo')).toHaveValue(email); // los datos que ya tenía no se pisan
  await dlg.getByTestId('save-talent').click();
  await expect(dlg).toBeHidden({ timeout: 30000 });

  const x = await (await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: H })).json();
  const years = Object.fromEntries(x.techSkills.map((s: { label: { es: string }; years: number }) => [s.label.es, s.years]));
  expect(years).toMatchObject({ Java: 6, Kotlin: 5, Go: 1 }); // Java se actualiza; Kotlin conserva sus años; Go nueva con el mínimo
  expect(x.experiences).toHaveLength(1); // la misma experiencia no se duplica
  expect(x.educations).toHaveLength(1);
  expect(x.files.find((f: { id: string }) => f.id === x.cvId)?.name).toContain('cv-sample');
  expect(x.email).toBe(email);
});

test('carga rápida con un talento que ya existe: se avisa y solo se actualiza (sin duplicar)', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const id = crypto.randomUUID();
  const email = `existe.${Date.now()}@correo.pe`;
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id, firstName: 'Lucía', lastName: 'Existente', email: email.toUpperCase(), phone: '+51 911111111' } })).status()).toBe(201);
  // el endpoint normaliza igual que al guardar
  expect((await (await admin.ctx.post('/api/v1/tenant/talents/match', { headers: H, data: { email: ` ${email} ` } })).json()).match).toMatchObject({ id, matchedBy: 'EMAIL' });
  expect((await (await admin.ctx.post('/api/v1/tenant/talents/match', { headers: H, data: { email: 'nadie@x.pe' } })).json()).match).toBeNull();

  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.route('**/api/v1/tenant/talents/cv/read', (r) => r.fulfill({ json: read(email) }));
  await page.getByTestId('quick-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Carga rápida con CV' });
  await dlg.getByTestId('quick-file').setInputFiles('e2e/fixtures/cv-sample.pdf');
  await dlg.getByTestId('quick-analyze').click();
  await expect(dlg.getByTestId('quick-exists')).toContainText('Este talento ya existe: Lucía Existente', { timeout: 20000 });
  await expect(dlg.getByTestId('quick-exists')).toContainText('solo se actualizará su información');
  await dlg.getByRole('button', { name: 'Actualizar talento' }).click();
  await expect(page).toHaveURL(new RegExp(`/fractal/talentos/${id}$`), { timeout: 30000 });

  const x = await (await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: H })).json();
  expect(x).toMatchObject({ firstName: 'Lucía', lastName: 'Existente', phone: '+51 911111111', city: 'Lima' }); // no pisa, completa vacíos
  expect(x.experiences).toHaveLength(1);
  expect(x.files.find((f: { id: string }) => f.id === x.cvId)?.name).toContain('cv-sample');
  const dup = await (await admin.ctx.post('/api/v1/tenant/talents/search', { headers: H, data: { text: 'Existente', page: 1, pageSize: 50 } })).json().catch(() => null);
  if (dup?.items) expect(dup.items.filter((t: { id: string; lastName: string }) => t.lastName === 'Existente' && t.id !== id).length).toBe(0);
});

test('sin correo ni DNI en el CV: se reconoce el talento existente por nombre o por DNI (API de DNI) y se actualiza', async ({ page }) => {
  const admin = await createFractalAdmin();
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const H = { Authorization: `Bearer ${tok}` };
  const id = crypto.randomUUID();
  const stamp = Date.now();
  const last = `Jara${stamp}`;
  const dni = String(stamp).slice(-8);
  expect((await admin.ctx.post('/api/v1/tenant/talents', { headers: H, data: { id, firstName: 'Cristian Jhonathan', lastName: last, secondLastName: 'Mejía', docNumber: dni, email: `cj.${stamp}@x.pe` } })).status()).toBe(201);
  // mayúsculas, tildes y espacios no importan
  expect((await (await admin.ctx.post('/api/v1/tenant/talents/match', { headers: H, data: { firstName: ' cristian  jhonathan', lastName: last.toUpperCase(), secondLastName: 'mejia' } })).json()).match)
    .toMatchObject({ id, matchedBy: 'NAME' });

  const cv = { ...read(''), firstName: 'Cristian Jhonathan', lastName: last, secondLastName: 'Mejia', email: '', phoneCode: '', phoneNumber: '' };
  await uiLogin(page, 'fractal', admin.email, admin.password);
  await page.route('**/api/v1/tenant/talents/cv/read', (r) => r.fulfill({ json: cv }));
  await page.route('**/api/v1/tenant/identity/dni/*', (r) => r.fulfill({ json: { firstName: 'Cristian Jhonathan', lastName: last, secondLastName: 'Mejía', birthDate: '1990-05-01' } }));

  // carga rápida: por nombre avisa; si es un homónimo se puede seguir, pero con el DNI (API de DNI) se reconoce que ya existe
  await page.getByTestId('quick-talent').click();
  const dlg = page.getByRole('dialog', { name: 'Carga rápida con CV' });
  await dlg.getByTestId('quick-file').setInputFiles('e2e/fixtures/cv-sample.pdf');
  await dlg.getByTestId('quick-analyze').click();
  await expect(dlg.getByTestId('quick-exists')).toContainText('mismo nombre completo', { timeout: 20000 });
  await dlg.getByTestId('quick-other-person').click();
  await expect(dlg.getByRole('button', { name: 'Aceptar y crear talento' })).toBeVisible();
  await dlg.getByLabel('DNI').fill(dni);
  await dlg.getByTestId('quick-dni-lookup').click();
  await expect(dlg.getByTestId('quick-exists')).toContainText('mismo documento', { timeout: 10000 });
  await expect(dlg.getByRole('button', { name: 'Actualizar talento' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Cancelar' }).click();

  // alta completa: al leer el CV se avisa y se actualiza el talento existente (no se crea otro)
  await page.getByTestId('new-talent').click();
  const ed = page.getByRole('dialog', { name: 'Nuevo talento' });
  await ed.getByTestId('cv-read-input').setInputFiles('e2e/fixtures/cv-sample.pdf');
  await expect(ed.getByTestId('editor-dup')).toContainText('Este talento ya existe', { timeout: 20000 });
  await ed.getByTestId('editor-dup-update').click();
  await expect(page).toHaveURL(new RegExp(`/fractal/talentos/${id}$`), { timeout: 30000 });
  const list = await (await admin.ctx.post('/api/v1/tenant/talents/search', { headers: H, data: { search: last, page: 1, pageSize: 10 } })).json();
  expect(list.total).toBe(1);
  const x = await (await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: H })).json();
  expect(x.experiences).toHaveLength(1);
  expect(x.city).toBe('Lima');
  expect(x.files.find((f: { id: string }) => f.id === x.cvId)?.name).toContain('cv-sample');
});
