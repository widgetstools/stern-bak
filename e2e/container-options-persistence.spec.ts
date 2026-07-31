import { test, expect, type Page } from '@playwright/test';
import { bootClean, openPanel, waitForGrid } from './helpers/containerHost';

/**
 * Guardrail: a main customizer tab (Options → general-settings) must persist
 * its settings to IndexedDB via the panel's OWN Save and restore them after a
 * full reload. This locks in the cross-cutting fix that made every per-card
 * Save flush the active profile (`useModuleDraft.save` →
 * `settings:save-requested`), so panels are no longer silently
 * commit-to-memory-only.
 *
 * MarketsGridContainer mock host (port 5215). Run: `npm run e2e:container`.
 */

/** Open Options → Status Bar and return the toggle locator. */
async function openStatusBarToggle(page: Page) {
  await openPanel(page, 'general-settings');
  const filter = page.locator('[data-testid="go-filter-input"]');
  await filter.fill('stat');
  await filter.press('Enter');
  await page.locator('[data-testid="go-nav-09"]').click();
  return page.locator('[data-testid="go-status-bar"]');
}

test('Options (general-settings): a panel Save persists and survives reload', async ({ page }) => {
  await bootClean(page);

  const toggle = await openStatusBarToggle(page);
  const before = await toggle.getAttribute('data-state');
  await toggle.evaluate((el) => (el as HTMLButtonElement).click());
  const flipped = await toggle.getAttribute('data-state');
  expect(flipped, 'toggle actually flipped').not.toBe(before);

  // Panel's own Save — must reach IndexedDB on its own (no separate grid Save).
  await page.locator('[data-testid="go-save-btn"]').click();

  await page.reload();
  await waitForGrid(page);

  const restored = await openStatusBarToggle(page);
  await expect(
    restored,
    'status-bar toggle restored from IndexedDB after reload',
  ).toHaveAttribute('data-state', flipped!);
});
