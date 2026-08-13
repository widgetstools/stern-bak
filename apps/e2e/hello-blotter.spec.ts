import net from 'node:net';
import { test, expect } from '@playwright/test';

/**
 * hello-blotter north-star (port 5177).
 *
 * The whole app is one `createStarui()` call plus one `<StarGrid>` —
 * this spec is the proof that the Phase-1 front door delivers a live
 * SSRM blotter: rows render, columns are inferred from the feed (the
 * provider draft declares no columnDefinitions), and cells tick.
 *
 * Ticks only touch the numeric fields (currentPrice, pnl, …), which sit
 * to the RIGHT of the identity columns and are column-virtualized out of
 * the initial view — so the spec walks focus to the row's end (End key)
 * before polling for repaints. Data comes from stomp-view-server (:8081),
 * which the Playwright webServer list deliberately does not start; the
 * spec probes the socket and skips itself when the feed is down.
 *
 * Selectors are AG Grid 36 (`.ag-grid-scrolling-container`).
 */

const APP = 'http://localhost:5177/';

function stompServerUp(port = 8081, host = '127.0.0.1', timeoutMs = 1_500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

test.describe('hello-blotter north-star', () => {
  test.setTimeout(120_000);

  test('createStarui + StarGrid render a live SSRM blotter that ticks', async ({ page }) => {
    test.skip(!(await stompServerUp()), 'stomp-view-server (:8081) is not running');

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      // Regression guard: the snapshot's rows-received burst once tripped
      // React's nested-update ceiling and killed the root (frozen cells).
      if (msg.type() === 'error' && msg.text().includes('Maximum update depth')) {
        errors.push(`console: ${msg.text().slice(0, 120)}`);
      }
    });

    await page.goto(APP);

    // Rows stream in from the seeded provider.
    await expect(
      page.locator('.ag-grid-scrolling-container .ag-row').first(),
    ).toBeVisible({ timeout: 60_000 });

    // Columns are inferred from the feed — no columnDefinitions declared.
    await expect
      .poll(async () => page.locator('.ag-header-cell').count(), { timeout: 30_000 })
      .toBeGreaterThan(5);

    // Real grid body, not a collapsed shell.
    const viewport = page.locator('.ag-grid-viewport').first();
    const box = await viewport.boundingBox();
    expect(box, 'grid viewport should have a bounding box').toBeTruthy();
    expect(box!.height, 'grid viewport must not be collapsed').toBeGreaterThan(200);

    // Scroll the numeric (ticking) columns into view — they render to the
    // right of the identity columns and are column-virtualized out of the
    // initial viewport — then assert live repaints like the SSRM smoke.
    const numericColRendered = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.ag-header-cell')].some(
          (h) => h.getAttribute('col-id') === 'currentPrice',
        ),
      );
    await page.locator('.ag-grid-scrolling-container .ag-row').first().hover();
    for (let i = 0; i < 30 && !(await numericColRendered()); i += 1) {
      await page.mouse.wheel(1200, 0);
      await page.waitForTimeout(200);
    }
    expect(await numericColRendered(), 'currentPrice column should scroll into view').toBe(true);

    const cellSnap = () =>
      page
        .locator('.ag-grid-scrolling-container .ag-row')
        .evaluateAll((rows) =>
          rows.map((r) => `${r.getAttribute('row-id')}=${r.textContent}`).sort().join('|'),
        );
    const beforeTicks = await cellSnap();
    await expect
      .poll(async () => (await cellSnap()) !== beforeTicks, { timeout: 30_000 })
      .toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
