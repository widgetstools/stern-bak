import { test, expect } from '@playwright/test';
import {
  bootCleanReferenceBlotter,
  enableCellChangeFlashInGridOptions,
  E2E_MOCK_PROVIDER_NAME,
  REFERENCE_GRID_ID,
  seedMockPositionsProvider,
  selectLiveProvider,
  waitForFlashingCells,
  waitForMockPriceTick,
  waitForProviderRows,
  waitForReferenceBlotter,
} from './helpers/referenceBlotter';

/**
 * Reference-app integration — cell flash on live mock ticks.
 *
 * Flow:
 *   1. Boot `/blotters/marketsgrid` on markets-ui-react-reference (5174)
 *   2. Seed a mock positions provider with fast updateIntervalMs
 *   3. Select it in the Live provider picker
 *   4. Enable "Flash on change" in Grid Options
 *   5. Assert AG-Grid adds `ag-cell-data-changed` when mock ticks land
 */
test.describe('reference — cell flash on mock provider ticks', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await bootCleanReferenceBlotter(page);
    await seedMockPositionsProvider(page, { updateIntervalMs: 250 });
    await page.reload();
    await waitForReferenceBlotter(page);
    await selectLiveProvider(page, E2E_MOCK_PROVIDER_NAME);
    await waitForProviderRows(page);
  });

  test('enabling flash-on-change in Grid Options highlights updated cells', async ({ page }) => {
    // Confirm the mock stream is delivering deltas before we assert on flash.
    await waitForMockPriceTick(page);

    // Baseline: flash class should not appear while the option is off.
    await expect
      .poll(
        () => page.locator(`[data-grid-id="${REFERENCE_GRID_ID}"] .ag-cell-data-changed`).count(),
        { timeout: 2_500 },
      )
      .toBe(0);

    await enableCellChangeFlashInGridOptions(page);

    await waitForFlashingCells(page, 20_000);

    await expect(
      page.locator(`[data-grid-id="${REFERENCE_GRID_ID}"] .ag-center-cols-container .ag-cell-data-changed`).first(),
    ).toBeVisible();
  });
});
