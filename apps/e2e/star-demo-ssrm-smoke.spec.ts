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

    // AG Grid positions rows absolutely, so a row can count as "visible"
    // inside a zero-height viewport (chrome renders, grid body collapsed —
    // the exact bug the full-bleed hosted frame fixes). Assert real height.
    const viewport = page.locator('.ag-grid-viewport').first();
    const box = await viewport.boundingBox();
    expect(box, 'grid viewport should have a bounding box').toBeTruthy();
    expect(box!.height, 'grid viewport must not be collapsed').toBeGreaterThan(200);

    // Layout parity with star-demo: no SSRM-container strips above the grid.
    await expect(page.getByTestId('ssrm-provider-status')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /edit provider/i })).toHaveCount(0);

    // Live ticks must actually repaint cells. This is the app-level guard
    // for the whole chain (provider -> worker plane -> tick fan -> grid):
    // the lab spec covers the surface, but only this app exercises the
    // hosted container path where a pre-ready mount once bound the
    // datasource and tick filter to the fallback key column and froze
    // every cell while ticks kept arriving.
    const cellSnap = () =>
      page
        .locator('.ag-grid-scrolling-container .ag-row')
        .evaluateAll((rows) =>
          rows.map((r) => `${r.getAttribute('row-id')}=${r.textContent}`).sort().join('|'),
        );
    const beforeTicks = await cellSnap();
    await expect
      .poll(async () => (await cellSnap()) !== beforeTicks, { timeout: 20_000 })
      .toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('grids repopulate after a STOMP server restart without a page reload', async ({ page }) => {
    test.skip(!(await stompServerUp()), 'stomp-view-server (:8081) is not running');

    const { execSync, spawn } = await import('node:child_process');

    await page.goto(BLOTTER);
    const rows = page.locator('.ag-grid-scrolling-container .ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 45_000 });

    // Kill the feed. The transport marks disconnected and starts redialling.
    execSync('lsof -ti :8081 | xargs kill', { shell: '/bin/zsh' });
    await expect.poll(() => stompServerUp(), { timeout: 10_000 }).toBe(false);

    // Bring it back (fresh process, fresh snapshot on the server side).
    const server = spawn('npm', ['run', 'dev', '-w', '@wellsfargo-starui/stomp-view-server'], {
      cwd: `${process.cwd()}`,
      detached: true,
      stdio: 'ignore',
    });
    server.unref();
    await expect.poll(() => stompServerUp(), { timeout: 30_000 }).toBe(true);

    // No page.reload(): the transport reconnects (~5s redial), re-snapshots,
    // and the ready transition purges every grid via bindSsrmTicks. Assert
    // rows are present AND ticking again.
    const cellSnap = () =>
      page
        .locator('.ag-grid-scrolling-container .ag-row')
        .evaluateAll((rs) =>
          rs.map((r) => `${r.getAttribute('row-id')}=${r.textContent}`).sort().join('|'),
        );
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    const afterRestart = await cellSnap();
    await expect
      .poll(async () => (await cellSnap()) !== afterRestart, { timeout: 30_000 })
      .toBe(true);
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
