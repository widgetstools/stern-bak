/**
 * One AG Grid per blotter per load (refactor plan D2; WORKLOG 20).
 *
 * `BlotterHost` renders exactly one MarketsGrid: the data grid once the
 * provider's config is there, never a placeholder that a later phase
 * replaces. AG Grid Enterprise prints its licence banner once per grid
 * instance it creates, so the banner count on a cold load is the number of
 * grids the blotter built. The counter is installed before the reload so no
 * banner is missed; in a Vite dev build React StrictMode mounts effects
 * twice, so two is the expected count there and one in a production build.
 */
import { test, expect } from '../fixtures/launchOpenFin';

const BANNER = 'AG Grid Enterprise License';

test.describe('star-demo — one grid per blotter per load', () => {
  test('a cold load creates exactly one AG Grid instance', async ({ platform }) => {
    const page = await platform.openBlotter();
    await expect(page.locator('.ag-header-cell').first()).toBeVisible({ timeout: 45_000 });

    await page.addInitScript((marker: string) => {
      const w = window as unknown as { __agGridBanners: number };
      w.__agGridBanners = 0;
      const wrap = (name: 'error' | 'warn' | 'log') => {
        const original = console[name].bind(console);
        console[name] = (...args: unknown[]) => {
          if (args.some((a) => typeof a === 'string' && a.includes(marker))) w.__agGridBanners += 1;
          original(...args);
        };
      };
      wrap('error');
      wrap('warn');
      wrap('log');
    }, BANNER);
    await page.reload();
    await expect(page.locator('.ag-header-cell').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.ag-row .ag-cell').first()).toBeVisible({ timeout: 60_000 });

    const dev = await page.evaluate(() => Boolean(document.querySelector('script[src*="/@vite/client"]')));
    const banners = await page.evaluate(() => (window as unknown as { __agGridBanners: number }).__agGridBanners);
    const grids = await page.locator('.ag-root-wrapper').count();
    expect(grids).toBe(1);
    // Production: one grid, one banner. Dev (StrictMode): the same one grid, mounted twice.
    expect(banners).toBe(dev ? 2 : 1);
  });
});
