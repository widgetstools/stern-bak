import { test, expect } from '@playwright/test';
import { bootClean, openPanel, liveProviderTrigger, PROVIDER_A, PROVIDER_B } from './helpers/containerHost';

/**
 * Customizer surface smoke (per current-features: Grid Options panel, Custom
 * Settings provider host + toolbar-date AppData). Deterministic because the
 * grid is backed by a static mock provider — no ticking, single server.
 */

test('Grid Options status-bar toggle flips, marks dirty, and enables Save', async ({ page }) => {
  await bootClean(page);
  await openPanel(page, 'general-settings');

  const filter = page.locator('[data-testid="go-filter-input"]');
  await filter.fill('stat');
  await filter.press('Enter');
  await page.locator('[data-testid="go-nav-09"]').click();

  const toggle = page.locator('[data-testid="go-status-bar"]');
  const before = await toggle.getAttribute('data-state');
  await toggle.evaluate((el) => (el as HTMLButtonElement).click());
  expect(await toggle.getAttribute('data-state')).not.toBe(before);

  await expect(page.locator('[data-testid="go-summary-dirty"]')).toContainText('YES');
  await expect(page.locator('[data-testid="go-save-btn"]')).toBeEnabled();
});

test('Custom Settings exposes the provider host with both seeded providers', async ({ page }) => {
  await bootClean(page);
  await openPanel(page, 'toolbar-date-settings');

  await expect(page.locator('[data-testid="toolbar-date-settings-panel"]')).toBeVisible();
  await expect(page.locator('[data-testid="provider-grid-host-section"]')).toBeVisible();
  await expect(page.locator('[data-testid="provider-mode-toggle"]')).toBeVisible();

  // The live provider picker lists both mock providers.
  await liveProviderTrigger(page).click();
  const listbox = page.locator('[role="listbox"][data-state="open"]');
  await expect(listbox.getByRole('option', { name: new RegExp(PROVIDER_A) })).toBeVisible();
  await expect(listbox.getByRole('option', { name: new RegExp(PROVIDER_B) })).toBeVisible();
});

test('Custom Settings toolbar-date ENABLED toggle reveals the AppData provider + key rows', async ({ page }) => {
  await bootClean(page);
  await openPanel(page, 'toolbar-date-settings');

  // Provider/key rows are hidden until the historical-date AppData write is enabled.
  await expect(page.locator('[data-testid="tds-provider"]')).toHaveCount(0);

  await page.locator('[data-testid="tds-enabled-switch"]').click();

  await expect(page.locator('[data-testid="tds-provider"]')).toBeVisible();
  await expect(page.locator('[data-testid="tds-key"]')).toBeVisible();
});
