import { type Locator, expect, request, type APIRequestContext, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:8080';
export const ORIGIN = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
export const SA_EMAIL = process.env.E2E_SA_EMAIL ?? '';
export const SA_PASSWORD = process.env.E2E_SA_PASSWORD ?? '';

export function uniq(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}`;
}

export async function apiCtx(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: ORIGIN } });
}

export async function apiLogin(ctx: APIRequestContext, email: string, password: string, tenant = '') {
  const r = await ctx.post('/api/v1/auth/login', { data: { tenant, email, password } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).accessToken as string;
}

/** Crea por API un admin nuevo del tenant fractal (vía invitación del Super Admin). */
export async function createFractalAdmin(role = 'TENANT_ADMIN') {
  const ctx = await apiCtx();
  const sa = await apiLogin(ctx, SA_EMAIL, SA_PASSWORD);
  const tenants = await (await ctx.get('/api/v1/platform/tenants', { headers: { Authorization: `Bearer ${sa}` } })).json();
  const fractal = tenants.items.find((t: { slug: string }) => t.slug === 'fractal');
  const email = `${uniq('e2e')}@fractal.test`;
  const inv = await ctx.post(`/api/v1/platform/invitations?tenantId=${fractal.id}`, {
    headers: { Authorization: `Bearer ${sa}` }, data: { email, role, locale: 'es' },
  });
  expect(inv.status()).toBe(201);
  const token = (await inv.json()).link.split('/invitacion/')[1];
  const password = `E2e-${Date.now()}-Segura!`;
  const acc = await ctx.post(`/api/v1/invitations/${token}/accept`, { data: { fullName: 'Prueba E2E', password, locale: 'es' } });
  expect(acc.status()).toBe(204);
  return { ctx, sa, email, password, fractalId: fractal.id as string };
}

export async function uiLogin(page: Page, tenant: string, email: string, password: string) {
  await page.goto(`/${tenant}/login`);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Login por UI esperando a que la sesión quede establecida (sale de /login). */
export async function uiLoginOk(page: Page, tenant: string, email: string, password: string) {
  await uiLogin(page, tenant, email, password);
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  await expect(page.getByTestId('user-menu')).toBeVisible();
}

/** Cierra sesión desde el menú de usuario (clic en la inicial). */
export async function uiLogout(page: Page) {
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
}

/** Elige una opción en un SearchSelect (combo con búsqueda): escribe y hace clic en la opción. */
export async function pickOption(scope: Page | Locator, fieldLabel: string, text: string, typed = text) {
  await scope.getByLabel(fieldLabel, { exact: true }).fill(typed);
  await scope.getByRole('option', { name: text }).first().click();
}
