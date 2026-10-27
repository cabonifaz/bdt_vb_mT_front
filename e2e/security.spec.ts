// Pruebas de hacking ético (OWASP Top 10) contra la API y la UI.
import { test, expect } from '@playwright/test';
import { SA_EMAIL, SA_PASSWORD, apiCtx, apiLogin, createFractalAdmin, uiLogin } from './helpers';

test.describe('Seguridad (hacking ético)', () => {
  test('A07 el access token no se guarda en el navegador y la cookie de sesión es HttpOnly', async ({ page, context }) => {
    const admin = await createFractalAdmin();
    await uiLogin(page, 'fractal', admin.email, admin.password);
    await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(storage).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    expect(await page.evaluate(() => document.cookie)).not.toContain('bdt_rt');
    const cookie = (await context.cookies()).find((c) => c.name === 'bdt_rt');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/api/v1/auth');
  });

  test('A05 cabeceras de seguridad en la API', async () => {
    const r = await (await apiCtx()).get('/api/v1/public/tenants/fractal');
    const h = r.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['content-security-policy']).toContain("default-src 'none'");
    expect(h['strict-transport-security']).toContain('max-age=');
    expect(h['server']).toBeUndefined();
  });

  test('A05 CORS no acepta orígenes desconocidos', async () => {
    const r = await (await apiCtx()).fetch('/api/v1/auth/login', {
      method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(r.status()).toBe(403);
    expect(r.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('A03 inyección SQL en el login no rompe ni filtra información', async () => {
    const ctx = await apiCtx();
    for (const payload of ["' OR '1'='1", "admin'--", '"; DROP TABLE app_user; --']) {
      const r = await ctx.post('/api/v1/auth/login', { data: { tenant: "fractal' OR 1=1 --", email: payload, password: payload } });
      expect(r.status()).toBe(401);
      expect(await r.text()).not.toMatch(/sql|mysql|syntax|stack/i);
    }
  });

  test('A02 JWT sin firma (alg none) o manipulado es rechazado', async () => {
    const ctx = await apiCtx();
    const forged = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ4IiwicGVybXMiOlsicGxhdGZvcm0udGVuYW50cy5tYW5hZ2UiXX0.';
    expect((await ctx.get('/api/v1/platform/tenants', { headers: { Authorization: `Bearer ${forged}` } })).status()).toBe(401);
  });

  test('A01 escalada de privilegios: un admin de tenant no usa endpoints de plataforma', async () => {
    const { ctx, email, password, fractalId } = await createFractalAdmin();
    const auth = { Authorization: `Bearer ${await apiLogin(ctx, email, password, 'fractal')}` };
    expect((await ctx.get('/api/v1/platform/tenants', { headers: auth })).status()).toBe(403);
    expect((await ctx.get(`/api/v1/platform/users?tenantId=${fractalId}`, { headers: auth })).status()).toBe(403);
    const sa = await ctx.post('/api/v1/tenant/invitations', { headers: auth, data: { email: 'x@y.test', role: 'SUPER_ADMIN' } });
    expect(sa.status()).toBe(403);
  });

  test('A01 aislamiento entre tenants (IDOR)', async () => {
    const ctx = await apiCtx();
    const sa = await apiLogin(ctx, SA_EMAIL, SA_PASSWORD);
    const slug = `iso-${Date.now()}`;
    const created = await ctx.post('/api/v1/platform/tenants', {
      headers: { Authorization: `Bearer ${sa}` }, data: { slug, name: 'Tenant aislamiento', adminEmail: `admin@${slug}.test` },
    });
    expect(created.status()).toBe(201);
    const otherId = (await created.json()).tenant.id;
    const { email, password } = await createFractalAdmin();
    const auth = { Authorization: `Bearer ${await apiLogin(ctx, email, password, 'fractal')}` };
    // aunque fuerce ?tenantId, en /tenant/* siempre se usa su propio tenant
    const list = await (await ctx.get(`/api/v1/tenant/invitations?tenantId=${otherId}`, { headers: auth })).json();
    expect(JSON.stringify(list)).not.toContain(`admin@${slug}.test`);
    expect((await ctx.post('/api/v1/auth/login', { data: { tenant: slug, email, password } })).status()).toBe(401);
    // limpieza: suspender el tenant de prueba
    await ctx.patch(`/api/v1/platform/tenants/${otherId}/status`, { headers: { Authorization: `Bearer ${sa}` }, data: { status: 'CANCELLED' } });
  });

  test('A03 XSS: el nombre visible se muestra como texto, no como HTML', async ({ page }) => {
    const admin = await createFractalAdmin();
    await uiLogin(page, 'fractal', admin.email, admin.password);
    await page.getByRole('link', { name: 'Marca y colores' }).click();
    let dialogShown = false;
    page.on('dialog', async (d) => { dialogShown = true; await d.dismiss(); });
    const payload = '<img src=x onerror=alert(1)>';
    try {
      await page.getByLabel('Nombre visible').fill(payload);
      await page.getByTestId('save-branding').click();
      await expect(page.getByText('Marca actualizada')).toBeVisible();
      await page.goto('/fractal/login');
      await expect(page).toHaveTitle(payload);
      await expect(page.getByTestId('tenant-logo')).toHaveAttribute('alt', payload);
      expect(dialogShown).toBe(false);
    } finally {
      // restaurar siempre el nombre original de Fractal
      const ctx = await apiCtx();
      const tok = await apiLogin(ctx, admin.email, admin.password, 'fractal');
      const b = await (await ctx.get('/api/v1/public/tenants/fractal')).json();
      const r = await ctx.put('/api/v1/tenant/branding', {
        headers: { Authorization: `Bearer ${tok}` },
        data: { displayName: 'Fractal - Banco de talentos', colorPrimary: b.colorPrimary, colorPrimaryHover: b.colorPrimaryHover,
          colorSecondary: b.colorSecondary, colorAccent: b.colorAccent, colorSidebar: b.colorSidebar, fontFamily: b.fontFamily },
      });
      expect(r.status()).toBe(200);
    }
  });

  test('A04 subida de archivos: rechaza SVG/HTML disfrazado de imagen', async () => {
    const { ctx, email, password } = await createFractalAdmin();
    const tok = await apiLogin(ctx, email, password, 'fractal');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const r = await ctx.post('/api/v1/tenant/branding/files/logo', {
      headers: { Authorization: `Bearer ${tok}` },
      multipart: { file: { name: 'logo.png', mimeType: 'image/png', buffer: svg } },
    });
    expect(r.status()).toBe(422);
    expect((await r.json()).error.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  test('A01 archivos públicos: sin path traversal ni enumeración', async () => {
    const ctx = await apiCtx();
    for (const p of ['..%2F..%2F.env', '00000000-0000-0000-0000-000000000000', 'nada']) {
      const r = await ctx.get(`/api/v1/public/files/${p}`);
      expect([400, 404]).toContain(r.status());
    }
  });

  test('A01 refresh con Origin no confiable es rechazado (CSRF)', async () => {
    const r = await (await apiCtx()).fetch('/api/v1/auth/refresh', { method: 'POST', headers: { Origin: 'https://evil.example' } });
    expect(r.status()).toBe(403);
  });

  test('A09 los errores no exponen detalles internos', async () => {
    const r = await (await apiCtx()).post('/api/v1/auth/login', { data: '{malformado', headers: { 'Content-Type': 'application/json' } });
    expect(r.status()).toBe(422);
    const body = await r.json();
    expect(Object.keys(body.error).sort()).toEqual(['code', 'requestId']);
  });

  test('A04 la API de integración exige key habilitada', async () => {
    const ctx = await apiCtx();
    expect((await ctx.get('/integration/v1/openapi.json')).status()).toBe(401);
    expect((await ctx.get('/integration/v1/masters', { headers: { 'X-Api-Key': 'bdt_aaaaaaaaaaaa_inventada' } })).status()).toBe(401);
  });
});
