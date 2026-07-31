import { test, expect } from '@playwright/test';
import { bootClean, openPanel, waitForGrid, liveProviderTrigger, PROVIDER_B } from './helpers/containerHost';
import { pickSelectOptionByLocator } from './helpers/shadcnSelect';

/**
 * Regression for the customizer "save-and-switch" fix
 * (MarketsGridContainer.applyProviderSelection).
 *
 * Changing the live provider changes `activeId`, part of the <MarketsGrid>
 * key, so the grid remounts and re-hydrates the customizer from disk. Under
 * `disableAutoSave`, a per-card "Save" on another tab (here: Grid Options
 * status bar) lives ONLY in the in-memory store. Before the fix, the remount
 * discarded it. The fix flushes the working set via gridHandle.saveAll()
 * BEFORE applying the provider change, so the edit survives.
 *
 * This test FAILS without the fix (the toggle reverts after the switch) and
 * PASSES with it.
 */
test('a committed Grid Options edit survives a live-provider switch', async ({ page }) => {
  await bootClean(page);

  // 1. Flip the status-bar toggle in Grid Options and commit it with the
  //    panel's own Save (in-memory only under disableAutoSave).
  await openPanel(page, 'general-settings');
  const filter = page.locator('[data-testid="go-filter-input"]');
  await filter.fill('stat');
  await filter.press('Enter');
  await page.locator('[data-testid="go-nav-09"]').click();

  const toggle = page.locator('[data-testid="go-status-bar"]');
  const before = await toggle.getAttribute('data-state');
  await toggle.evaluate((el) => (el as HTMLButtonElement).click());
  const after = await toggle.getAttribute('data-state');
  expect(after).not.toBe(before); // the toggle actually flipped

  await page.locator('[data-testid="go-save-btn"]').click();

  // 2. Switch the LIVE provider in Custom Settings and Save → remount.
  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();

  // The remount tears down the sheet and rebuilds the grid on provider B.
  await waitForGrid(page);

  // 3. Re-open Grid Options: the toggle must still hold the flipped value.
  //    Without save-and-switch this reverts to `before` (the on-disk value).
  await openPanel(page, 'general-settings');
  await expect(page.locator('[data-testid="go-status-bar"]')).toHaveAttribute('data-state', after!);
});
