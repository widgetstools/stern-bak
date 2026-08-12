/**
 * Multi-blotter load — the primary regression guard.
 *
 * Opens three blotter windows with distinct instanceIds against one shared
 * data-services hub. Every window must reach an interactive grid with rows
 * and must never strand on "Connecting to ConfigService…" — the exact
 * failure mode the config-service perf work is meant to eliminate.
 */
import { test, expect, type BridgeReply } from '../fixtures/launchOpenFin';
import type { Page } from '@playwright/test';

const ROW_SELECTOR = '.ag-grid-scrolling-rows .ag-row';
const INSTANCE_IDS = ['multi-1', 'multi-2', 'multi-3'];

async function expectInteractiveWithRows(page: Page): Promise<number> {
  await expect(page.getByText('Connecting to ConfigService')).toHaveCount(0);
  await expect(page.locator('.ag-header-cell').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(ROW_SELECTOR).first()).toBeVisible({ timeout: 60_000 });
  return page.locator(ROW_SELECTOR).count();
}

test.describe('star-demo — multi-blotter load', () => {
  test('three blotters all reach interactive grids with rows', async ({ platform }) => {
    const pages: Page[] = [];
    for (const id of INSTANCE_IDS) {
      pages.push(await platform.openBlotter(id));
    }

    for (const page of pages) {
      const rows = await expectInteractiveWithRows(page);
      expect(rows).toBeGreaterThan(0);
    }
  });

  test('the shared platform stays healthy after multiple windows open', async ({ platform }) => {
    // The hub/bridge must still answer once several blotters are attached —
    // a deadlocked config service would hang this round-trip.
    const reply: BridgeReply<unknown[]> = await platform.bridge.getWorkspaces();
    expect(reply.ok).toBe(true);
  });
});
