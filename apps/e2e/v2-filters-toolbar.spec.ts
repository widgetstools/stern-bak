import { test, expect, Page } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';

/**
 * E2E tests for the v2 FiltersToolbar (/ demo mount).
 *
 * Mirrors the v1 `filters-toolbar.spec.ts` test surface for the features that
 * were intentionally preserved across the port:
 *  - empty state, capture, toggle, AND/OR composition, hover icons,
 *    rename, remove, auto-save persistence (Dexie, no Save All click), and
 *    scroll-overflow chrome.
 *
 * Intentionally OMITTED vs v1 (deliberate cuts in v2):
 *  - row-count badges on pills (would re-couple v2 to rowData)
 *  - localStorage-key save assertions (`ds-filters:<gridId>` — v2 persists via
 *    profile snapshot in IndexedDB, no legacy keys are written)
 *  - toolbar-switcher dance — v2 renders FiltersToolbar inline, no pill click
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function clearV2Persistence(page: Page) {
  // demo-react persists in IndexedDB via @wellsfargo-starui/config-service's bundled
  // appConfig row. Wipe the marketsui-config db and the active-profile
  // pointer so each test starts from a clean slate.
  await page.evaluate(async () => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('gc-active-profile:') || k.startsWith('gc-state:') || k.startsWith('ds-grid:'))
      .forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('profile-migration-v1');
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('marketsui-config');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

function filterPills(page: Page) {
  // The count-badge inside each pill carries a `filter-pill-count-<id>`
  // testid that shares the `filter-pill-` prefix, so a bare prefix
  // locator double-counts. Scope to the outer pill's stable class.
  return page.locator('.ds-filter-pill[data-testid^="filter-pill-"]');
}

function filterToggleBtn(page: Page, index: number) {
  return filterPills(page).nth(index).locator('.ds-filter-pill-btn');
}

async function getFilterPillCount(page: Page): Promise<number> {
  return filterPills(page).count();
}

async function clickAddFilter(page: Page) {
  const btn = page.locator('[data-testid="filters-add-btn"]');
  await expect(btn).toBeEnabled({ timeout: 5000 });
  await btn.click();
  await page.waitForTimeout(400);
}

async function clickClearAllFilters(page: Page) {
  const btn = page.locator('[data-testid="filters-clear-btn"]');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  await page.waitForTimeout(400);
}

async function getDisplayedRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // Prefer the AG-Grid api (returns the total filtered count, not just the
    // virtualised viewport count). Walk the React fiber tree to find it.
    const gridRoot = document.querySelector('.ag-root-wrapper');
    if (!gridRoot) return -1;
    const fiberKey = Object.keys(gridRoot).find(k => k.startsWith('__reactFiber'));
    if (fiberKey) {
      let fiber = (gridRoot as never)[fiberKey];
      for (let i = 0; i < 80 && fiber; i++) {
        if (fiber.stateNode?.api?.getDisplayedRowCount) {
          return fiber.stateNode.api.getDisplayedRowCount();
        }
        if (fiber.memoizedState) {
          let state = fiber.memoizedState;
          while (state) {
            const ms = state.memoizedState;
            if (ms?.api?.getDisplayedRowCount) return ms.api.getDisplayedRowCount();
            if (ms?.current?.api?.getDisplayedRowCount) return ms.current.api.getDisplayedRowCount();
            state = state.next;
          }
        }
        fiber = fiber.return;
      }
    }
    // Fallback: parse status bar.
    const statusText = document.querySelector('.ag-status-bar')?.textContent ?? '';
    const match = statusText.match(/(\d+)\s+of\s+(\d+)/);
    if (match) return parseInt(match[1], 10);
    return -1;
  });
}

/** Reach the AG-Grid api by walking the React fiber tree. Same idiom as v1 spec. */
async function setFilterViaApi(page: Page, filterModel: Record<string, unknown>) {
  await page.evaluate((model) => {
    const gridRoot = document.querySelector('.ag-root-wrapper');
    if (!gridRoot) return;
    const fiberKey = Object.keys(gridRoot).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (gridRoot as never)[fiberKey];
    for (let i = 0; i < 80 && fiber; i++) {
      if (fiber.stateNode?.api?.setFilterModel) {
        fiber.stateNode.api.setFilterModel(model);
        return;
      }
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          const ms = state.memoizedState;
          if (ms?.api?.setFilterModel) { ms.api.setFilterModel(model); return; }
          if (ms?.current?.api?.setFilterModel) { ms.current.api.setFilterModel(model); return; }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
  }, filterModel);
  await page.waitForTimeout(500);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('v2 FiltersToolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearV2Persistence(page);
    await page.goto('/');
    await waitForGrid(page);
    // Sanity: the filters toolbar is visible inline (no switcher in v2).
    await expect(page.locator('[data-testid="filters-toolbar"]')).toBeVisible();
  });

  test('shows empty toolbar with only + button', async ({ page }) => {
    await expect(page.locator('.ds-filters-add-btn')).toBeVisible();
    expect(await getFilterPillCount(page)).toBe(0);
    // No clear-all button with no pills
    await expect(page.locator('.ds-filters-clear-btn')).toHaveCount(0);
  });

  test('toggle off removes filter from grid', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    const filteredCount = await getDisplayedRowCount(page);
    await clickAddFilter(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);
    const unfilteredCount = await getDisplayedRowCount(page);
    expect(unfilteredCount).toBeGreaterThan(filteredCount);
  });

  test('toggle on re-applies filter', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    const filteredCount = await getDisplayedRowCount(page);
    await clickAddFilter(page);

    const btn = filterToggleBtn(page, 0);
    await btn.click();
    await page.waitForTimeout(500);
    expect(await getDisplayedRowCount(page)).toBeGreaterThan(filteredCount);

    await btn.click();
    await page.waitForTimeout(500);
    expect(await getDisplayedRowCount(page)).toBeLessThanOrEqual(filteredCount + 1);
  });

  test('clear all deactivates every pill and removes grid filter', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    const filteredCount = await getDisplayedRowCount(page);
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(1);

    await clickClearAllFilters(page);

    expect(await getDisplayedRowCount(page)).toBeGreaterThan(filteredCount);
    const activePills = await page.locator('.ds-filter-pill[data-active="true"]').count();
    expect(activePills).toBe(0);
    expect(await getFilterPillCount(page)).toBe(1);

    const clearBtn = page.locator('[data-testid="filters-clear-btn"]');
    await expect(clearBtn).toBeDisabled();
    await expect(clearBtn).toHaveAttribute('data-enabled', 'false');
  });

  test('multiple filters compose with AND across columns', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    const buyOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);

    await setFilterViaApi(page, { venue: { filterType: 'set', values: ['NYSE'] } });
    await clickAddFilter(page);
    const venueOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click(); // BUY back on
    await page.waitForTimeout(500);
    const both = await getDisplayedRowCount(page);
    expect(both).toBeLessThanOrEqual(Math.min(buyOnly, venueOnly));
  });

  test('same-column set filters merge values with OR', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    const buyOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);

    await setFilterViaApi(page, { side: { filterType: 'set', values: ['SELL'] } });
    await clickAddFilter(page);
    const sellOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);
    const both = await getDisplayedRowCount(page);
    expect(both).toBeGreaterThanOrEqual(Math.max(buyOnly, sellOnly));
  });

  test('hover reveals rename + remove icons', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);

    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);
    await expect(pill.locator('button[title="Rename"]')).toBeVisible();
    await expect(pill.locator('button[title="Remove"]')).toBeVisible();
  });

  test('rename updates label', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);

    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);
    await pill.locator('button[title="Rename"]').click();
    await page.waitForTimeout(300);

    const input = page.locator('.ds-filter-rename-input');
    await expect(input).toBeVisible();
    await input.fill('My BUY Filter');
    await input.press('Enter');
    await page.waitForTimeout(300);

    const text = await filterPills(page).first().textContent();
    expect(text).toContain('My BUY Filter');
  });

  test('+ button stays DISABLED when live filter matches an INACTIVE pill (no duplicates)', async ({ page }) => {
    // Regression guard: earlier versions compared live only to the
    // MERGED ACTIVE pills. If the user toggled a pill off and then
    // re-entered the same filter into the grid, the + button
    // re-enabled and clicking it created a duplicate pill. Now the
    // uniqueness check spans every pill (active OR inactive).
    const model = { side: { filterType: 'set', values: ['BUY'] } };

    // Create pill A (active).
    await setFilterViaApi(page, model);
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(1);

    // Toggle pill A off → it goes inactive; live filter clears.
    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(300);

    // Re-enter the SAME filter into AG-Grid.
    await setFilterViaApi(page, model);
    await page.waitForTimeout(300);

    // + button stays disabled (not enabled) — pill A still exists in
    // the toolbar state, just muted. Clicking + would duplicate.
    const addBtn = page.locator('[data-testid="filters-add-btn"]');
    await expect(addBtn).toBeDisabled();

    // Defensive: even if the DOM disabled attribute were somehow lost,
    // a forced click would no-op via addFromLive's isNewFilter guard.
    await addBtn.click({ force: true });
    await page.waitForTimeout(200);
    expect(await getFilterPillCount(page)).toBe(1);
  });

  test('new pill captures ONLY the delta vs active pills (not the combined model)', async ({ page }) => {
    // Regression guard: when pill A is active and the user adds a
    // filter on a NEW column, the + button must capture ONLY the new
    // column's criterion. Previously handleAdd stored the full live
    // model (A's filter + new one), so the new pill contained both
    // and toggling A off left the new pill still enforcing A's side.
    const pillA = { side: { filterType: 'set', values: ['BUY'] } };
    await setFilterViaApi(page, pillA);
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(1);

    // Now the user layers a `price > 100` filter onto the active grid.
    // Live model = { side: BUY, price > 100 }.
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    });
    await page.waitForTimeout(400);

    // Capture the new pill. It should carry ONLY `price > 100` —
    // not the combined model.
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(2);

    // Toggle pill A off. Live filter should now be just `price > 100`.
    // Pre-fix: pill B also contained `side: BUY`, so toggling A off
    // left the merged active = {side: BUY, price > 100}, and the
    // `side: BUY` criterion would stick. Post-fix: pill B is just
    // `price > 100`, so toggling A off yields live = {price > 100}.
    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(400);

    const liveAfterToggle = await page.evaluate(() => {
      const gridRoot = document.querySelector('.ag-root-wrapper');
      if (!gridRoot) return null;
      const fiberKey = Object.keys(gridRoot).find((k) => k.startsWith('__reactFiber'));
      if (!fiberKey) return null;
      let fiber = (gridRoot as never)[fiberKey];
      for (let i = 0; i < 80 && fiber; i++) {
        if (fiber.stateNode?.api?.getFilterModel) {
          return fiber.stateNode.api.getFilterModel();
        }
        if (fiber.memoizedState) {
          let state = fiber.memoizedState;
          while (state) {
            const ms = state.memoizedState;
            if (ms?.api?.getFilterModel) return ms.api.getFilterModel();
            if (ms?.current?.api?.getFilterModel) return ms.current.api.getFilterModel();
            state = state.next;
          }
        }
        fiber = fiber.return;
      }
      return null;
    });
    expect(liveAfterToggle).not.toBeNull();
    const model = liveAfterToggle as Record<string, unknown>;
    expect(Object.keys(model)).toEqual(['price']);
    expect((model.price as { filter: number }).filter).toBe(100);
  });

  test('clear + add buttons sit OUTSIDE the scroll container (always visible)', async ({ page }) => {
    // Regression guard: the clear-all (FunnelX) and add-new (+) buttons
    // are sticky action items that must remain visible even when the
    // pill row overflows. They live in `.ds-filters-actions`, after
    // the right scroll caret, NOT inside `.ds-filter-scroll`.
    const addBtn = page.locator('[data-testid="filters-add-btn"]');
    // The + button is always rendered (disabled when no new filter).
    await expect(addBtn).toBeVisible();

    // DOM placement: add button's closest `.ds-filter-scroll` ancestor
    // should NOT exist — it's in the sticky action cluster instead.
    const insideScroll = await addBtn.evaluate(
      (el) => !!el.closest('.ds-filter-scroll'),
    );
    expect(insideScroll).toBe(false);

    const insideActions = await addBtn.evaluate(
      (el) => !!el.closest('.ds-filters-actions'),
    );
    expect(insideActions).toBe(true);

    // Create a pill so the clear-all button mounts.
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    const clearBtn = page.locator('[data-testid="filters-clear-btn"]');
    await expect(clearBtn).toBeVisible();
    // Same sticky-group placement.
    const clearInsideScroll = await clearBtn.evaluate(
      (el) => !!el.closest('.ds-filter-scroll'),
    );
    expect(clearInsideScroll).toBe(false);
    const clearInsideActions = await clearBtn.evaluate(
      (el) => !!el.closest('.ds-filters-actions'),
    );
    expect(clearInsideActions).toBe(true);
  });

  test('collapse toggle hides pills + reveals summary chip; persists across reload', async ({ page }) => {
    // Create a couple of pills first.
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    // Second pill via a different column + delta capture.
    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(300);
    await setFilterViaApi(page, { venue: { filterType: 'set', values: ['NYSE'] } });
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(2);

    // Expanded by default — pills visible, no summary chip.
    const toolbar = page.locator('[data-testid="filters-toolbar"]');
    await expect(toolbar).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('[data-testid="filters-summary-chip"]')).toHaveCount(0);

    // Collapse. The chevron toggles from ChevronUp → ChevronDown (tested
    // only via data-expanded; the glyph swap is visual).
    await page.locator('[data-testid="filters-collapse-toggle"]').click();
    await expect(toolbar).toHaveAttribute('data-expanded', 'false');

    // Pill row is gone; summary chip shows `2 filters · 1 active`.
    await expect(page.locator('.ds-filter-scroll')).toHaveCount(0);
    const chip = page.locator('[data-testid="filters-summary-chip"]');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('2');
    await expect(chip).toContainText('filters');
    await expect(chip).toContainText('1 active');

    // Persist: the toolbar-visibility module stores the state — save
    // and reload to confirm the collapsed view sticks.
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
    await expect(
      page.locator('[data-testid="filters-toolbar"]'),
    ).toHaveAttribute('data-expanded', 'false');
    await expect(
      page.locator('[data-testid="filters-summary-chip"]'),
    ).toBeVisible();
  });

  test('clicking the summary chip expands the pill carousel', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    await page.locator('[data-testid="filters-collapse-toggle"]').click();

    // Now collapsed — click the chip itself (not the chevron) to expand.
    const chip = page.locator('[data-testid="filters-summary-chip"]');
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(
      page.locator('[data-testid="filters-toolbar"]'),
    ).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('.ds-filter-scroll')).toBeVisible();
  });

  test('collapsed toolbar keeps clear + add buttons reachable', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    await page.locator('[data-testid="filters-collapse-toggle"]').click();
    await expect(
      page.locator('[data-testid="filters-toolbar"]'),
    ).toHaveAttribute('data-expanded', 'false');

    // Clear-all and add buttons still in the DOM because
    // `.ds-filters-actions` sits outside the collapsible pill section.
    await expect(page.locator('.ds-filters-clear-btn')).toBeVisible();
    await expect(page.locator('[data-testid="filters-add-btn"]')).toBeVisible();
  });

  test('formatter-toolbar toggle (brush) lives OUTSIDE the filters toolbar', async ({ page }) => {
    // Brush was hoisted into the primary row's action cluster. Verify
    // the testid still exists but sits in `.ds-primary-actions`, NOT
    // inside `.ds-filters-actions`.
    const trigger = page.locator('[data-testid="toolbar-view-menu-trigger"]');
    await expect(trigger).toBeVisible();
    const insideFiltersActions = await trigger.evaluate(
      (el) => !!el.closest('.ds-filters-actions'),
    );
    expect(insideFiltersActions).toBe(false);
    const insidePrimaryActions = await trigger.evaluate(
      (el) => !!el.closest('.ds-primary-actions'),
    );
    expect(insidePrimaryActions).toBe(true);
    await openViewMenu(page);
    await expect(page.locator('[data-testid="style-toolbar-toggle"]')).toBeVisible();
  });

  test('pill-row scroll container hides the browser scrollbar', async ({ page }) => {
    // The carousel has dedicated carets for overflow discovery
    // (`filters-caret-left` / `filters-caret-right`). The native
    // scrollbar is hidden to stop it from stealing vertical space or
    // clashing with the terminal aesthetic.
    const scrollbarChrome = await page.evaluate(() => {
      const el = document.querySelector('.ds-filter-scroll') as HTMLElement | null;
      if (!el) return null;
      const styles = getComputedStyle(el);
      return {
        // Firefox path — `scrollbar-width: none` + Firefox-specific prop.
        scrollbarWidth: styles.getPropertyValue('scrollbar-width').trim(),
        // Chromium/WebKit path — measure thumb thickness by diffing
        // offsetHeight (visible box) from clientHeight (inner box);
        // a hidden scrollbar means 0 diff even when content overflows.
        offsetH: el.offsetHeight,
        clientH: el.clientHeight,
      };
    });
    expect(scrollbarChrome).not.toBeNull();
    // Firefox reports 'none'; Chromium reports '' (unsupported) but the
    // ::-webkit-scrollbar { display: none } suppresses the chrome box.
    expect(['none', '']).toContain(scrollbarChrome!.scrollbarWidth);
    // Scroll chrome should add 0 px height (offset == client).
    expect(scrollbarChrome!.offsetH).toBe(scrollbarChrome!.clientH);
  });
});
