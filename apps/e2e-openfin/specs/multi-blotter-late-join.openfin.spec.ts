/**
 * Late-join — a blotter opened after the hub is warm must attach fast.
 *
 * Open blotter #1 and let it fully hydrate (config ready, hub connected,
 * STOMP snapshot rendered). THEN open blotter #2. The second window joins
 * an already-warm SharedWorker hub + seeded ConfigManager, so it should
 * reach rows comfortably inside the warm budget without re-seeding or
 * stranding on the identity gate.
 */
import { test, expect } from '../fixtures/launchOpenFin';
import type { Page } from '@playwright/test';

const ROW_SELECTOR = '.ag-grid-scrolling-rows .ag-row';
// Phase 5 — warm fast-attach budget. A second blotter joining an already-warm
// hub + seeded ConfigManager reaches rows in ~10-11s across the Phase 2-4 runs.
// 25s is a tight regression guard (~2.3x the observed warm time) that still
// tolerates CI/hub-contention variance — but is far below the multi-second
// "Connecting to ConfigService" stall this work eliminated. We wait for rows
// with a generous ceiling so a slow-but-eventually-loading window fails on the
// explicit budget assertion (clear message) rather than an opaque row timeout.
const WARM_ATTACH_BUDGET_MS = 25_000;
const ROW_WAIT_CEILING_MS = 60_000;

async function waitForRows(page: Page, timeout: number): Promise<void> {
  await expect(page.getByText('Connecting to ConfigService')).toHaveCount(0);
  await expect(page.locator(ROW_SELECTOR).first()).toBeVisible({ timeout });
}

test.describe('star-demo — multi-blotter late join', () => {
  test('a blotter opened after the hub is warm attaches and shows rows', async ({ platform }) => {
    const first = await platform.openBlotter('late-first');
    await waitForRows(first, ROW_WAIT_CEILING_MS);

    const started = Date.now();
    const second = await platform.openBlotter('late-second');
    await waitForRows(second, ROW_WAIT_CEILING_MS);
    const elapsed = Date.now() - started;

    console.log(`[late-join] warm second blotter reached rows in ${elapsed}ms`);
    expect(await second.locator(ROW_SELECTOR).count()).toBeGreaterThan(0);
    // Hard guard: a warm second window must attach inside the tight budget.
    expect(
      elapsed,
      `warm second blotter took ${elapsed}ms (budget ${WARM_ATTACH_BUDGET_MS}ms)`,
    ).toBeLessThan(WARM_ATTACH_BUDGET_MS);
  });
});
