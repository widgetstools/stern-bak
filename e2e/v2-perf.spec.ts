import { test, expect, type Page } from '@playwright/test';

/**
 * Performance canaries.
 *
 *   1. Mount budget — `nav → first row visible in the DOM`. This is
 *      what a user perceives as "the grid appeared." Covers AG-Grid
 *      init, store construction, and the first round of column-def
 *      transforms. Bar: ≤ 1500ms median on the dev server (jitter on
 *      cold-cache runs would flake a tighter ceiling).
 *
 *   2. Auto-save latency — `module state change → IndexedDB write
 *      observable`. Bar: ≤ 1s round-trip from a profile-create click,
 *      catching a 700ms cushion above the 300ms debounce target.
 *
 * Each measurement runs 3× and takes the median to smooth jitter.
 * Hard absolute thresholds are deliberately loose because CI hardware
 * varies; the assertions catch *regressions*, not absolute slowness.
 *
 * (Replaced an earlier v1-vs-v2 parity comparison after v1 was
 * removed — the comparison was navigating to the same URL twice.)
 */

async function measureMountMs(page: Page, path: string): Promise<number> {
  // Fresh context per measurement — no warm AG-Grid module cache, no warm Dexie.
  const start = Date.now();
  await page.goto(path);
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  return Date.now() - start;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

test.describe('perf canaries', () => {
  test('mount budget: median first-row visible under 1.5s (median of 3 runs)', async ({ browser }) => {
    const runs = 3;
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      times.push(await measureMountMs(page, '/'));
      await ctx.close();
    }

    const med = median(times);
    // eslint-disable-next-line no-console
    console.log(`[perf] mount median: ${med}ms (runs: ${times.join(', ')})`);

    // Bar varies by runner:
    //   - Linux CI / fast Mac: 1.5s. Mount is typically ~400ms in dev;
    //     the ceiling catches genuine regressions (a module pipeline
    //     walking the world, an accidental sync fetch).
    //   - Windows + single-worker dev server: cold-cache mount routinely
    //     exceeds 1.5s (~3s observed). Bumping the ceiling here keeps
    //     the canary useful as a regression guard without flaking on
    //     the slower runner. Re-tighten when CI catches up.
    const ceiling = process.platform === 'win32' ? 4_000 : 1_500;
    expect(med).toBeLessThan(ceiling);
  });

  test('auto-save latency: profile creation observed in IndexedDB within 1s', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });

    // Clear db so the create is observable against a clean slate.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('marketsui-config');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
      localStorage.removeItem('profile-migration-v1');
    });
    await page.goto('/');
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
    await page.waitForTimeout(400); // initial Default-profile auto-seed

    const tStart = Date.now();
    await page.locator('[data-testid="profile-selector-trigger"]').click();
    await page.locator('[data-testid="profile-selector-popover"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="profile-name-input"]').fill('Perf-Test');
    await page.locator('[data-testid="profile-create-btn"]').click();

    // Poll IndexedDB until the new row appears (i.e., auto-save fired).
    const deadline = Date.now() + 2_000;
    let observedMs = -1;
    while (Date.now() < deadline) {
      const found = await page.evaluate(async () => {
        return new Promise<boolean>((resolve) => {
          const req = indexedDB.open('marketsui-config');
          req.onerror = () => resolve(false);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('appConfig')) { db.close(); resolve(false); return; }
            const tx = db.transaction('appConfig', 'readonly');
            const req2 = tx.objectStore('appConfig').getAll();
            req2.onsuccess = () => {
              const rows = (req2.result as Array<{ payload?: { profiles?: Array<{ name?: string }> } }>) || [];
              db.close();
              const hit = rows.some((r) =>
                Array.isArray(r.payload?.profiles)
                && (r.payload!.profiles as Array<{ name?: string }>).some((p) => p.name === 'Perf-Test'),
              );
              resolve(hit);
            };
            req2.onerror = () => { db.close(); resolve(false); };
          };
        });
      });
      if (found) {
        observedMs = Date.now() - tStart;
        break;
      }
      await page.waitForTimeout(50);
    }

    // eslint-disable-next-line no-console
    console.log(`[perf] auto-save observed ${observedMs}ms after profile create click`);
    expect(observedMs).toBeGreaterThan(-1);
    // Debounce target is 300ms; give a 700ms cushion for IndexedDB round-trip +
    // the React render loop that writes the new profile id into localStorage.
    expect(observedMs).toBeLessThan(1_000);
  });
});
