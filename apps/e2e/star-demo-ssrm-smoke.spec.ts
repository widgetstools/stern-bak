import net from 'node:net';
import { test, expect } from '@playwright/test';

/**
 * star-demo-ssrm boot smoke (port 5176).
 *
 * The blotter route mounts HostedSsrmMarketsGrid against the seeded
 * `stomp-ssrm` provider, so real rows require stomp-view-server on :8081.
 * That server is intentionally not in the Playwright webServer list — this
 * spec probes the socket and skips itself when the feed is down, so the
 * suite stays green on a machine that only runs the UI apps.
 *
 * Selectors are AG Grid 36 (`.ag-grid-scrolling-container`; the 35-era
 * `.ag-center-cols-container` does not exist).
 */

const APP = 'http://127.0.0.1:5176';
const BLOTTER = `${APP}/#/blotters/marketsgrid`;

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

test.describe('star-demo-ssrm smoke', () => {
  test.setTimeout(90_000);

  test('blotter renders SSRM rows from the STOMP feed without page errors', async ({ page }) => {
    test.skip(!(await stompServerUp()), 'stomp-view-server (:8081) is not running');

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto(BLOTTER);
    await expect(
      page.locator('.ag-grid-scrolling-container .ag-row').first(),
    ).toBeVisible({ timeout: 45_000 });

    // Steady state: observe long enough for the first live ticks to land.
    await page.waitForTimeout(10_000);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('app shell serves and routes without the feed', async ({ page }) => {
    // Runs regardless of the STOMP server: the shell itself must boot.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto(APP);
    await expect(page.locator('a[href="#/blotters/marketsgrid"]')).toBeVisible({
      timeout: 30_000,
    });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
