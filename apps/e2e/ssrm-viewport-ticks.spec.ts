import { test, expect, type Page } from '@playwright/test';

/**
 * SSRM live-tick coverage on the MarketsGrid SSRM lab (port 5320).
 *
 * The worker only forwards ticks for rows a session reports as loaded. AG Grid
 * keeps up to `maxBlocksInCache` (20) blocks of 100 rows rendered, but the
 * datasource used to report only the most recently loaded block — so scrolling
 * away and back left the earlier rows visibly frozen while the feed ran on.
 *
 * Selectors are AG Grid 36: rows live under `.ag-grid-scrolling-container`
 * and the scrollable element is `.ag-grid-viewport` (the 35-era
 * `.ag-center-cols-container` / `.ag-body-viewport` no longer exist).
 */

const LAB_URL = 'http://127.0.0.1:5320';
const GRID = '[data-grid-id="lab-live-v6"]';
const ROWS = `${GRID} .ag-grid-scrolling-container .ag-row`;
const VIEWPORT = `${GRID} .ag-grid-viewport`;
const TICK_COLUMN = 'midPrice';
const TICK_WINDOW_MS = 15_000;

async function openLiveTab(page: Page): Promise<void> {
  await page.goto(LAB_URL);
  await page.getByTestId('lab-tab-live').click();
  await expect(page.locator(ROWS).first()).toBeVisible({ timeout: 30_000 });
  // Let the first block settle before sampling values.
  await page.waitForTimeout(1_500);
}

/**
 * Snapshot of every rendered row's ticking cell, as `rowId=value` pairs.
 *
 * Deliberately samples the whole viewport rather than one pinned row: the mock
 * feed ticks a random 1-4% of rows per interval, so any single row has a real
 * chance of never being touched inside a test window. Across ~18 rendered rows
 * that chance is negligible, and the assertion is strictly more sensitive —
 * the bug being guarded against freezes *every* row in the block, not one.
 */
async function viewportSnapshot(page: Page): Promise<string[]> {
  return page.locator(ROWS).evaluateAll(
    (rows, col) =>
      rows
        .map((r) => {
          const id = r.getAttribute('row-id') ?? '';
          const cell = r.querySelector(`[col-id="${col}"]`);
          return id && cell ? `${id}=${cell.textContent?.trim() ?? ''}` : '';
        })
        .filter(Boolean)
        .sort(),
    TICK_COLUMN,
  );
}

/** True once any rendered row's value differs from the baseline snapshot. */
async function someRowChanged(page: Page, before: string[]): Promise<boolean> {
  const now = await viewportSnapshot(page);
  if (now.length === 0) return false;
  const baseline = new Set(before);
  return now.some((entry) => !baseline.has(entry));
}

async function scrollGrid(page: Page, top: number): Promise<void> {
  await page.locator(VIEWPORT).evaluate((el, y) => {
    el.scrollTop = y;
  }, top);
  // Block fetch + render.
  await page.waitForTimeout(1_500);
}

test.describe('SSRM viewport ticks', () => {
  test.setTimeout(120_000);

  test('the first block keeps ticking after scrolling away and back', async ({ page }) => {
    await openLiveTab(page);

    // Pull later blocks into the cache (rows ~200 and ~400), then return.
    await scrollGrid(page, 6_000);
    await scrollGrid(page, 12_000);
    await scrollGrid(page, 0);

    const before = await viewportSnapshot(page);
    expect(before.length, 'expected rendered rows to sample').toBeGreaterThan(0);

    // Before the viewport-interest fix the whole first block was frozen: the
    // worker had replaced this session's interest with the last block's keys.
    await expect
      .poll(() => someRowChanged(page, before), { timeout: TICK_WINDOW_MS })
      .toBe(true);
  });

  test('a middle block keeps ticking after a further block loads', async ({ page }) => {
    await openLiveTab(page);

    // Land on a middle block, then pull a further one so the middle block is
    // no longer the most recently loaded. Only the most recent block survived
    // the old replace-per-block behaviour, so this is the discriminating case.
    await scrollGrid(page, 6_000);
    await scrollGrid(page, 12_000);
    await scrollGrid(page, 6_000);

    const before = await viewportSnapshot(page);
    expect(before.length, 'expected rendered rows to sample').toBeGreaterThan(0);

    await expect
      .poll(() => someRowChanged(page, before), { timeout: TICK_WINDOW_MS })
      .toBe(true);
  });
});

test.describe('SSRM console health', () => {
  test.setTimeout(120_000);

  test('scrolling and teardown produce no unhandled rejections or grid errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (/Not started \(providerId=/.test(text)) errors.push(`console: ${text}`);
      if (/Maximum update depth exceeded/.test(text)) errors.push(`console: ${text}`);
      if (/\[ssrm\] getRows failed/.test(text)) errors.push(`console: ${text}`);
    });

    await openLiveTab(page);
    await scrollGrid(page, 6_000);
    await scrollGrid(page, 12_000);
    await scrollGrid(page, 0);

    // Navigating away tears the provider down while viewport updates are in
    // flight — the case that used to raise an unhandled rejection.
    await page.getByTestId('lab-tab-calc').click();
    await page.waitForTimeout(3_000);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
