import { test, expect, type Page } from '@playwright/test';
import { createFractalAdmin, uiLoginOk } from './helpers';

// Cada paso de cada guía: la tarjeta entra completa en la pantalla y no tapa el elemento resaltado
// (salvo que el elemento ocupe casi toda la pantalla, como el tablero, donde va en una esquina).
test.describe.configure({ timeout: 300_000 });

const SCREENS = ['', 'talentos', 'requerimientos', 'favoritos', 'entrevistas', 'lista-negra', 'documentos', 'soporte', 'novedades'];
const SIZES = [{ width: 1440, height: 900 }, { width: 1024, height: 680 }];

async function checkTour(page: Page, name: string) {
  await page.getByTestId('help-button').click();
  const tour = page.getByTestId('tour');
  const card = tour.getByRole('dialog');
  await expect(card).toBeVisible();
  const vp = page.viewportSize()!;
  for (let n = 1; ; n++) {
    await page.waitForTimeout(350); // el resaltado se anima
    const c = (await card.boundingBox())!;
    expect(c.y, `${name} paso ${n}: arriba`).toBeGreaterThanOrEqual(0);
    expect(c.x, `${name} paso ${n}: izquierda`).toBeGreaterThanOrEqual(0);
    expect(c.y + c.height, `${name} paso ${n}: abajo`).toBeLessThanOrEqual(vp.height + 1);
    expect(c.x + c.width, `${name} paso ${n}: derecha`).toBeLessThanOrEqual(vp.width + 1);
    const spot = tour.locator('.tour-spot');
    if (await spot.count()) {
      const s = (await spot.boundingBox())!;
      const ox = Math.max(0, Math.min(c.x + c.width, s.x + s.width) - Math.max(c.x, s.x));
      const oy = Math.max(0, Math.min(c.y + c.height, s.y + s.height) - Math.max(c.y, s.y));
      const huge = s.width * s.height > vp.width * vp.height * 0.4;
      if (!huge) expect(ox * oy, `${name} paso ${n}: tapa el elemento`).toBe(0);
    }
    await page.screenshot({ path: `test-results/tours/${vp.width}-${name || 'inicio'}-${n}.png` });
    const next = tour.getByTestId('tour-next');
    if ((await next.textContent()) === 'Entendido') { await next.click(); break; }
    await next.click();
  }
  await expect(tour).toHaveCount(0);
}

for (const size of SIZES) {
  test(`guías bien ubicadas a ${size.width}×${size.height}`, async ({ page }) => {
    const admin = await createFractalAdmin('TENANT_ADMIN');
    await page.setViewportSize(size);
    await uiLoginOk(page, 'fractal', admin.email, admin.password);
    for (const s of SCREENS) {
      await page.goto(`/fractal/${s}`);
      await page.waitForLoadState('networkidle');
      await checkTour(page, s);
    }
    await page.goto('/fractal/requerimientos');
    await page.getByTestId('rq-board').locator('a[href*="/requerimientos/"]').first().click();
    await page.waitForLoadState('networkidle');
    await checkTour(page, 'rq-detalle');
  });
}
