import { test, expect } from '@playwright/test';
import {
  bootCleanReferenceBlotter,
  E2E_MOCK_PROVIDER_NAME,
  REFERENCE_GRID_ID,
  refreshProviderFromGridAdmin,
  revealProviderToolbar,
  seedMockPositionsProvider,
  selectLiveProvider,
  stopLiveProviderFromDiagnostics,
  waitForProviderRows,
  waitForReferenceBlotter,
  waitForStaleDataBanner,
  waitForStaleDataBannerHidden,
} from './helpers/referenceBlotter';

/**
 * Stale-data UX — when the live provider stops, the grid shows a
 * flashing banner and disables edits; refreshing the provider clears
 * the banner and restores live rows.
 */
test.describe('reference — stale data on provider disconnect', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await bootCleanReferenceBlotter(page);
    await seedMockPositionsProvider(page, { updateIntervalMs: 500 });
    await page.reload();
    await waitForReferenceBlotter(page);
    await revealProviderToolbar(page);
    await selectLiveProvider(page, E2E_MOCK_PROVIDER_NAME);
    await waitForProviderRows(page);
  });

  test('stopping the provider shows the stale banner and marks the grid read-only', async ({ page }) => {
    const grid = page.locator(`[data-grid-id="${REFERENCE_GRID_ID}"]`);
    await expect(grid).not.toHaveAttribute('data-stale', 'true');

    await stopLiveProviderFromDiagnostics(page);

    await waitForStaleDataBanner(page);
    await expect(grid).toHaveAttribute('data-stale', 'true');
    await expect(page.getByTestId('stale-data-banner')).toContainText(/stale/i);
    await expect(page.getByTestId('stale-data-banner')).toContainText(/disconnected|stopped/i);
  });

  test('refreshing the provider after stop clears the banner and restores rows', async ({ page }) => {
    await stopLiveProviderFromDiagnostics(page);
    await waitForStaleDataBanner(page);

    await refreshProviderFromGridAdmin(page);

    await waitForStaleDataBannerHidden(page);
    await expect(page.locator(`[data-grid-id="${REFERENCE_GRID_ID}"]`)).not.toHaveAttribute(
      'data-stale',
      'true',
    );
    await waitForProviderRows(page);
  });
});
