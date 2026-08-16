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

/**
 * A calculated column that AGGREGATES is a fold over the whole dataset, and the
 * grid holds ~2,000 of its rows at a time. Evaluated from the block cache it
 * silently answers a different question in every scroll position — an average
 * of "whatever is loaded" presented as the average of everything.
 *
 * The lab's live profile seeds `AVG([midPrice])` for exactly this assertion.
 * The value is allowed to MOVE (the feed ticks), but at any one instant every
 * rendered row must agree, and the value must not step when a different block
 * is what happens to be loaded.
 */
test.describe('SSRM aggregate calculated columns', () => {
  test.setTimeout(120_000);

  const AGG_COLUMN = 'avgMid';

  /** The calculated column is appended after the provider's own, so it sits
   *  off the right edge — and AG Grid renders only the columns inside the
   *  horizontal viewport. Scroll it into the DOM before reading. */
  async function scrollToAggregateColumn(page: Page): Promise<void> {
    await page.locator(VIEWPORT).evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(500);
  }

  /** Every rendered row's value for the aggregate column, as numbers. */
  async function aggregateValues(page: Page): Promise<number[]> {
    const texts = await page
      .locator(`${GRID} .ag-cell[col-id="${AGG_COLUMN}"]`)
      .evaluateAll((cells) => cells.map((c) => c.textContent?.trim() ?? '').filter((v) => v !== ''));
    return texts.map((t) => Number(t.replace(/[^0-9.\-]/g, '')));
  }

  test('reads the same in every row, at every scroll position', async ({ page }) => {
    await openLiveTab(page);

    // The mock feed is 500 rows in 100-row blocks around a mid of ~100 with a
    // per-instrument spread of several points. A fold over one block would sit
    // roughly `sd/sqrt(100)` away from the dataset fold — tenths, not
    // ten-thousandths — and would step every time a different block loaded.
    // A tenth of a point is therefore far below "wrong" and far above the
    // drift a live feed produces between two block fetches.
    const TOLERANCE = 0.1;
    const samples: number[] = [];

    for (const top of [0, 6_000, 12_000, 0]) {
      await scrollGrid(page, top);
      await scrollToAggregateColumn(page);
      const values = await aggregateValues(page);
      expect(values.length, `expected the aggregate column at scrollTop=${top}`).toBeGreaterThan(0);
      // A real average of a price column. Catches the other way this can go
      // wrong: folding an EMPTY row set, which the expression language answers
      // with 0 rather than with a blank.
      for (const v of values) {
        expect(Number.isFinite(v) && v > 1, `implausible aggregate ${v} at scrollTop=${top}`).toBe(true);
      }

      // Within one viewport: rows from two different blocks are rendered
      // together, and a block-cache fold would give each block its own answer.
      const withinView = Math.max(...values) - Math.min(...values);
      expect(withinView, `aggregate disagreed within the viewport at scrollTop=${top}: ${values.join(', ')}`)
        .toBeLessThan(TOLERANCE);
      samples.push(values[0]);
    }

    // Across positions: the whole point is that loading a different block does
    // not move the number. The feed ticks, so it may drift a little; it must
    // not STEP.
    const drift = Math.max(...samples) - Math.min(...samples);
    expect(drift, `aggregate drifted across scroll positions: ${samples.join(', ')}`)
      .toBeLessThan(TOLERANCE);
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
