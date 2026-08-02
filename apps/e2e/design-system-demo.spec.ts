import { test, expect } from '@playwright/test';

const URL = 'http://localhost:5310/';

test.describe('design-system demo', () => {
  // ── Existing tests (keep exactly as-is) ──────────────────────────────────────

  test('boots on the Market tab with the blotter', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('ds-topbar')).toBeVisible();
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to the Design System tab and renders the gallery', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('ds-tab-design-system').click();
    await expect(page.getByTestId('ds-designsystem')).toBeVisible();
    await page.getByTestId('ds-section-buttons').click();
    await expect(page.getByTestId('ds-demo-button')).toBeVisible();
  });

  test('theme toggle flips data-theme', async ({ page }) => {
    await page.goto(URL);
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.getByTestId('theme-toggle').click();
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(after).not.toBe(before);
  });

  // ── New: Market tab — order book + floating windows ──────────────────────────

  test('Market tab: order-book panel is visible on load', async ({ page }) => {
    await page.goto(URL);
    // order-book is in its own dock tab group (g-book) so it's immediately visible
    await expect(page.getByTestId('order-book')).toBeVisible({ timeout: 20_000 });
  });

  test('Market tab: New Order button opens floating Trade Ticket', async ({ page }) => {
    await page.goto(URL);
    // Wait for the app to fully settle (blotter + dock mounted)
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('topbar-new-order').click();
    // float-ticket is the FloatingWindow wrapper; trade-ticket is the inner content
    await expect(page.getByTestId('float-ticket')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('trade-ticket')).toBeVisible();
  });

  test('Market tab: RFQ button opens floating RFQ Workbench', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('topbar-rfq').click();
    await expect(page.getByTestId('float-rfq')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('rfq-workbench')).toBeVisible();
  });

  // ── New: Analytics tab — OAS Duration scatter chart is visible ────────────────

  test('Analytics tab: OAS-Duration scatter panel is visible', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('ds-tab-analytics').click();
    // panel-oasDuration is in its own dock group (g-oasdur) — visible immediately
    await expect(page.getByTestId('panel-oasDuration')).toBeVisible({ timeout: 20_000 });
  });
});
