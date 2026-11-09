import { test, expect, request } from '@playwright/test';
import { createFractalAdmin, uiLoginOk } from './helpers';

// Integración con IGDT desde la pantalla: el admin pega el token, la empresa queda conectada y los clientes y contactos
// pasan a solo lectura; al desconectar vuelven a editarse en BDT. Necesita IGDT (E2E_IGDT_API y su Super Admin).
const IGDT = process.env.E2E_IGDT_API;
test.skip(!IGDT, 'sin IGDT configurado para la prueba (E2E_IGDT_API)');
test.describe.configure({ timeout: 180_000 });

async function igdtToken() {
  const ctx = await request.newContext({ baseURL: IGDT, extraHTTPHeaders: { Origin: 'http://localhost:5174' } });
  const login = async (tenant: string, email: string, password: string) =>
    (await (await ctx.post('/api/v1/auth/login', { data: { tenant, email, password } })).json()).accessToken as string;
  const sa = await login('', process.env.E2E_IGDT_SA_EMAIL!, process.env.E2E_IGDT_SA_PASSWORD!);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const tenants = await (await ctx.get('/api/v1/platform/tenants', { headers: auth(sa) })).json();
  const fractal = tenants.items.find((x: { slug: string }) => x.slug === 'fractal');
  const email = `e2e.${Date.now()}@fractal.test`;
  const inv = await (await ctx.post(`/api/v1/platform/invitations?tenantId=${fractal.id}`, { headers: auth(sa), data: { email, role: 'TENANT_ADMIN', locale: 'es' } })).json();
  const pwd = `E2e-${Date.now()}-Seguro!`;
  await ctx.post(`/api/v1/invitations/${inv.link.split('/invitacion/')[1]}/accept`, { data: { fullName: 'Admin E2E', password: pwd, locale: 'es' } });
  const admin = await login('fractal', email, pwd);
  const key = await (await ctx.post('/api/v1/tenant/api-keys', { headers: auth(admin), data: { name: 'BDT e2e', scopes: ['masters.read', 'catalog.import', 'requirements.write', 'hires.write'] } })).json();
  await ctx.patch(`/api/v1/platform/api-keys/${key.id}/status`, { headers: auth(sa), data: { status: 'ENABLED' } });
  return key.secret as string;
}

test('conectar con IGDT: clientes y contactos de solo lectura y desconexión', async ({ page }) => {
  const token = await igdtToken();
  const admin = await createFractalAdmin('TENANT_ADMIN');
  await page.setViewportSize({ width: 1440, height: 900 });
  await uiLoginOk(page, 'fractal', admin.email, admin.password);
  await page.getByRole('link', { name: 'Integración IGDT' }).click();
  // si la empresa ya está conectada (ambiente en uso), la prueba no la desconecta
  await expect(page.getByTestId('igdt-state')).toBeVisible();
  test.skip((await page.getByTestId('igdt-state').textContent())!.includes('Conectada'), 'Fractal ya está conectada a IGDT: no se desconecta un ambiente en uso');
  await expect(page.getByTestId('igdt-state')).toContainText('Sin conectar');
  await page.getByTestId('igdt-token').fill(token);
  await page.getByTestId('igdt-connect').click();
  await expect(page.getByTestId('igdt-state')).toContainText('Conectada con IGDT', { timeout: 60_000 });
  await expect(page.getByTestId('igdt-last-sync')).not.toHaveText('—');

  await page.getByRole('link', { name: 'Clientes' }).click();
  await expect(page.getByTestId('managed-by-igdt')).toBeVisible();
  await expect(page.getByTestId('new-client')).toHaveCount(0);

  await page.goto('/fractal/integracion-igdt');
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('igdt-disconnect').click();
  await expect(page.getByTestId('igdt-state')).toContainText('Sin conectar');
  await page.getByRole('link', { name: 'Clientes' }).click();
  await expect(page.getByTestId('new-client')).toBeVisible();
  await expect(page.getByTestId('managed-by-igdt')).toHaveCount(0);
});
