/**
 * Smoke: a single star-demo MarketsGrid blotter mounts inside a real
 * OpenFin runtime, reaches an interactive grid with STOMP-fed rows, and
 * the rows tick. This is the baseline the multi-window guards build on.
 */
import { test, expect } from '../fixtures/launchOpenFin';

// AG Grid 36: the scrolling body rows live under `.ag-grid-scrolling-rows`
// (`.ag-center-cols-container` is gone).
const ROWS_CONTAINER_SELECTOR = '.ag-grid-scrolling-rows';
const ROW_SELECTOR = `${ROWS_CONTAINER_SELECTOR} .ag-row`;
const CELL_SELECTOR = `${ROW_SELECTOR} .ag-cell`;

test.describe('star-demo — blotter smoke', () => {
  test('blotter mounts in OpenFin and loads STOMP rows', async ({ platform }) => {
    const page = await platform.openBlotter();

    // Grid shell paints (headers from the provider column definitions).
    await expect(page.locator('.ag-header-cell').first()).toBeVisible({ timeout: 30_000 });

    // The identity gate must not strand the window on its placeholder.
    await expect(page.getByText('Connecting to ConfigService')).toHaveCount(0);

    // Rows arrive over the STOMP snapshot.
    await expect(page.locator(ROW_SELECTOR).first()).toBeVisible({ timeout: 45_000 });
    const rowCount = await page.locator(ROW_SELECTOR).count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('rows tick while running inside OpenFin', async ({ platform }) => {
    const page = await platform.openBlotter();
    const firstCell = page.locator(CELL_SELECTOR).first();
    await expect(firstCell).toBeVisible({ timeout: 45_000 });

    // Sample the rendered block's text repeatedly; the live STOMP feed
    // mutates rows. One cheap round-trip per sample (textContent of the body
    // container, no layout): a 20k-row CSRM blotter keeps its main thread
    // busy, so each evaluation queues behind long tasks (1–5 s measured) —
    // `allInnerTexts` over every rendered cell, thirty times, ran past the
    // test timeout. The whole block, not the first cells: AG Grid renders
    // only the visible columns, and the ticking ones sit to the right of the
    // static id/name columns (the fixture widens the window for that).
    const sample = () =>
      page.evaluate(
        (selector) => document.querySelector(selector)?.textContent ?? '',
        ROWS_CONTAINER_SELECTOR,
      );

    const before = await sample();
    await expect.poll(sample, { timeout: 45_000, intervals: [500] }).not.toBe(before);
  });
});
