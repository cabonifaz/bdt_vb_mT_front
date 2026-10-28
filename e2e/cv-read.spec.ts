import { test, expect, type Page } from '@playwright/test';
import { apiLogin, createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

// Lectura de CV con IA para el alta: el texto se extrae del PDF en el navegador y el backend lo estructura con OpenAI.
// En la prueba la IA se simula (no consume tokens); se verifica que el texto del PDF llegue al backend.
const read = (email: string) => ({
  firstName: 'Lucía', lastName: 'Fernández', secondLastName: 'Prado', docNumber: '', email, phoneCode: '51', phoneNumber: '987654321',
  countryCode: 'PE', city: 'Lima', linkedin: 'https://linkedin.com/in/luciafp', github: '', headline: 'Analista Programadora',
  summary: 'Ingeniera de software con 10 años de experiencia en sistemas financieros y equipos ágiles.',
  techSkills: [{ name: 'Java', years: 8 }, { name: 'Playwright', years: 2 }], softSkills: ['Trabajo en equipo'],
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
  await expect(dlg.getByLabel('Apellido paterno')).toHaveValue('Fernández');
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

  await dlg.getByTestId('quick-create').click();
  await expect(dlg.getByText('Obligatorio')).toBeVisible(); // falta el celular
  await dlg.getByLabel('Celular').fill('+51 912345678');
  await dlg.getByTestId('quick-create').click();
  await expect(page).toHaveURL(/\/fractal\/talentos\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await expect(page.getByText('Talento creado desde su CV.').last()).toBeVisible();

  const id = page.url().split('/').pop()!;
  const tok = await apiLogin(admin.ctx, admin.email, admin.password, 'fractal');
  const x = await (await admin.ctx.get(`/api/v1/tenant/talents/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  expect(x).toMatchObject({ firstName: 'Lucía', lastName: 'Fernández', email, phone: '+51 912345678', city: 'Lima', linkedinUrl: 'https://linkedin.com/in/luciafp' });
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
