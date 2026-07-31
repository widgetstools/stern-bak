import { test, expect } from '@playwright/test';
import {
  bootCleanDemo,
  forceNavigateToPanel,
} from './helpers/settingsSheet';

/**
 * Regression for Grid Options bool toggles appearing dead when Tailwind
 * peer-checked utilities were missing (custom checkbox Switch). Covers
 * the user-reported path: search "stat" → SHOW STATUS BAR.
 */
test('status bar toggle works with search filter active', async ({ page }) => {
  await bootCleanDemo(page);
  await forceNavigateToPanel(page, 'general-settings');

  const filter = page.locator('[data-testid="go-filter-input"]');
  await filter.fill('stat');
  await filter.press('Enter');

  // Sidebar scrolls the filtered band into the scroll container.
  await page.locator('[data-testid="go-nav-09"]').click();

  const toggle = page.locator('[data-testid="go-status-bar"]');
  await expect(toggle).toHaveAttribute('data-state', 'unchecked');

  await toggle.evaluate((el) => (el as HTMLButtonElement).click());
  await expect(toggle).toHaveAttribute('data-state', 'checked');
  await expect(page.locator('[data-testid="go-summary-dirty"]')).toContainText('YES');
  await expect(page.locator('[data-testid="go-save-btn"]')).toBeEnabled();
});
