import { test, expect, type Locator } from '@playwright/test';
import { createFractalAdmin, uiLoginOk as uiLogin } from './helpers';

/** Posición (x, y, ancho) de cada pestaña y del propio modal. */
async function layout(dlg: Locator) {
  const boxes = await dlg.getByRole('tab').evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`;
  }));
  const d = await dlg.boundingBox();
  return { tabs: boxes, dialog: `${Math.round(d!.y)},${Math.round(d!.height)}` };
}

test('modales con pestañas: pestañas y modal no cambian de posición al navegar', async ({ page }) => {
  const admin = await createFractalAdmin();
  await uiLogin(page, 'fractal', admin.email, admin.password);

  // talento: todas las pestañas
  await page.getByTestId('new-talent').click();
  const tdlg = page.getByRole('dialog', { name: 'Nuevo talento' });
  const t0 = await layout(tdlg);
  for (const tab of await tdlg.getByRole('tab').all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(await layout(tdlg)).toEqual(t0);
  }
  await tdlg.getByRole('button', { name: 'Cancelar' }).click();

  // entrevista: cambiar de tipo agrega pestañas solo al final; las existentes no se mueven
  await page.getByTestId('sidebar').getByRole('link', { name: 'Entrevistas' }).click();
  await page.getByTestId('new-interview').click();
  const idlg = page.getByRole('dialog', { name: 'Nueva entrevista' });
  await idlg.getByTestId('type-VIRTUAL').click();
  const i0 = await layout(idlg);
  for (const tab of await idlg.getByRole('tab').all()) {
    await tab.click();
    expect(await layout(idlg)).toEqual(i0);
  }
  await idlg.getByTestId('itab-general').click();
  await idlg.getByTestId('type-PHONE').click();
  const i1 = await layout(idlg);
  expect(i1.dialog).toBe(i0.dialog);
  expect(i1.tabs.slice(0, 2)).toEqual(i0.tabs.slice(0, 2)); // General y Entrevistadores en el mismo lugar
  // agregar un entrevistador no desplaza las pestañas (el contador siempre está visible)
  await idlg.getByTestId('itab-interviewers').click();
  await idlg.getByTestId('add-interviewer').click();
  expect(await layout(idlg)).toEqual(i1);
});
