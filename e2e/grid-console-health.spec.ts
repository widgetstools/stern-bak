import { test, expect } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule, waitForV2Grid } from './helpers/settingsSheet';

/**
 * Guards against React update-depth loops and other console regressions on
 * the primary MarketsGrid demo surface. AgGridReact re-processes props on
 * every reference change — unstable pipeline outputs + toolbar setState
 * used to trigger "Maximum update depth exceeded" spam.
 */
test.describe('MarketsGrid console health', () => {
  test('single grid stays free of React update-depth errors (live tick on)', async ({ page }) => {
    const depthErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Maximum update depth exceeded')) {
        depthErrors.push(msg.text());
      }
    });

    await page.goto('/?view=single');
    await waitForV2Grid(page);
    // Ignore profile-hydration burst; assert steady state stays clean.
    await page.waitForTimeout(3_000);
    depthErrors.length = 0;
    await page.waitForTimeout(10_000);

    expect(depthErrors, depthErrors.join('\n')).toEqual([]);
  });

  test('single grid stays free of update-depth errors with live tick paused', async ({ page }) => {
    const depthErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Maximum update depth exceeded')) {
        depthErrors.push(msg.text());
      }
    });

    await page.goto('/?view=single');
    await page.evaluate(() => localStorage.setItem('gc-ticking', 'off'));
    await page.reload();
    await waitForV2Grid(page);
    await page.waitForTimeout(3_000);
    depthErrors.length = 0;
    await page.waitForTimeout(8_000);

    expect(depthErrors, depthErrors.join('\n')).toEqual([]);
  });

  test('general settings panel toggles without update-depth errors', async ({ page }) => {
    const depthErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Maximum update depth exceeded')) {
        depthErrors.push(msg.text());
      }
    });

    await page.goto('/?view=single');
    await waitForV2Grid(page);
    await clickSettingsFromToolbar(page);
    await navigateToModule(page, 'general-settings');
    await page.waitForSelector('[data-testid="go-panel"]', { timeout: 10_000 });

    depthErrors.length = 0;

    const animateToggle = page.getByTestId('go-animate-rows');
    await animateToggle.click();
    await page.waitForTimeout(500);
    await animateToggle.click();
    await page.waitForTimeout(2_000);

    expect(depthErrors, depthErrors.join('\n')).toEqual([]);
  });
});
