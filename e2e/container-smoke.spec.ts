import { test, expect } from '@playwright/test';
import { bootClean } from './helpers/containerHost';

/** Smoke: the mock-backed grid renders and the customizer opens. */
test('grid renders mock rows and the customizer opens', async ({ page }) => {
  await bootClean(page);

  expect(await page.locator('.ag-body-viewport .ag-row').count()).toBeGreaterThan(0);

  await page.locator('[data-testid="toolbar-more-menu-trigger"]').click();
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
  await expect(page.locator('.ds-sheet')).toBeVisible();
  // Custom Settings lives in the OPTIONS group of the module menubar.
  await expect(
    page.locator('[data-testid^="v2-settings-nav-group-"][data-modules~="toolbar-date-settings"]'),
  ).toBeVisible();
});
