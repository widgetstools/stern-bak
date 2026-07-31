import { expect, type Page } from '@playwright/test';

/**
 * Helpers for the nested-fields fixture suite (`?view=fixture&f=<name>`).
 *
 * Mirrors `settingsSheet.ts` for the showcase grid, but targets the
 * per-fixture gridId (`fixture-<name>`) so parallel workers don't
 * collide on shared selectors.
 *
 * Boot pattern:
 *   1. Wipe the v2 IndexedDB + localStorage active-profile pointers.
 *   2. Navigate to `?view=fixture&f=<name>`.
 *   3. Wait for the fixture banner + grid rows.
 *   4. Force a redraw (via the shared `forceGridRedraw` helper) — newly
 *      seeded conditional-styling rules occasionally need one nudge to
 *      re-evaluate row class predicates that AG-Grid's first render
 *      computed before the profile state landed.
 */

import { forceGridRedraw } from './profileHelpers';

export type FixtureName =
  | 'formatter'
  | 'cond-cell'
  | 'cond-row'
  | 'calc'
  | 'groups'
  | 'kitchen-sink';

export const FIXTURE_GRID_ID = (name: FixtureName): string => `fixture-${name}`;

export async function clearFixtureStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('marketsui-config');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:') || k.startsWith('gc-showcase-seeded:'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('profile-migration-v1');
  });
}

/**
 * Boot a fixture in a known-clean state. Returns the fixture's grid id
 * for convenience (every assertion that targets a specific grid uses
 * this).
 */
export async function bootFixture(page: Page, name: FixtureName): Promise<string> {
  // First load — needed because indexedDB.deleteDatabase requires a
  // navigated page context, and clearing happens in two passes for the
  // same reason `bootCleanDemo` does it twice.
  await page.goto(`/?view=fixture&f=${name}`);
  await page.waitForSelector('[data-testid="fixture-banner"]', { timeout: 10_000 });
  await clearFixtureStorage(page);
  await page.goto(`/?view=fixture&f=${name}`);
  await page.waitForSelector(`[data-testid="fixture-banner"][data-fixture-name="${name}"]`, { timeout: 10_000 });
  await page.waitForSelector(`[data-grid-id="${FIXTURE_GRID_ID(name)}"]`, { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  // Settle: profile load + transform pipeline + AG-Grid first paint.
  await page.waitForTimeout(500);
  await forceGridRedraw(page);
  return FIXTURE_GRID_ID(name);
}

// ─── DOM probes for nested-field cells ───────────────────────────────
//
// AG-Grid renders each row across up to three sibling DOM containers
// (pinned-left, center viewport, pinned-right). Every container hosts
// its own `.ag-row[row-id="..."]` element that only contains the cells
// belonging to that container. So `row.querySelector(.ag-cell[col-id])`
// only finds cells whose container matches the row instance you picked.
//
// Helpers below iterate over EVERY `.ag-row` instance that shares the
// row-id, then look up the cell across them. This makes them robust to
// pinned/non-pinned column placement without the spec needing to know
// which container the column lives in.

function findCellInDom(rowId: string, colId: string): Element | null {
  const rows = document.querySelectorAll(`.ag-row[row-id="${CSS.escape(rowId)}"]`);
  for (const row of rows) {
    const cell = row.querySelector(`.ag-cell[col-id="${CSS.escape(colId)}"]`);
    if (cell) return cell;
  }
  return null;
}

/**
 * Read the rendered text of the cell at row id `rowId`, column id
 * `colId`. AG-Grid stamps `[col-id="..."]` onto each cell; for nested
 * dot-notation colIds (e.g. `pricing.bid`) the attribute matches the
 * literal colId verbatim — no encoding inside the attribute selector.
 */
export async function readCellText(page: Page, rowId: string, colId: string): Promise<string | null> {
  return page.evaluate(([r, c]) => {
    const rows = document.querySelectorAll(`.ag-row[row-id="${CSS.escape(r)}"]`);
    for (const row of rows) {
      const cell = row.querySelector(`.ag-cell[col-id="${CSS.escape(c)}"]`);
      if (cell) return (cell.textContent ?? '').trim();
    }
    return null;
  }, [rowId, colId]);
}

/**
 * `getComputedStyle(cell).color` — used to assert that a conditional-
 * styling rule's text colour landed on the right cell.
 */
export async function readCellColor(page: Page, rowId: string, colId: string): Promise<string> {
  return page.evaluate(([r, c]) => {
    const rows = document.querySelectorAll(`.ag-row[row-id="${CSS.escape(r)}"]`);
    for (const row of rows) {
      const cell = row.querySelector(`.ag-cell[col-id="${CSS.escape(c)}"]`) as HTMLElement | null;
      if (cell) return getComputedStyle(cell).color;
    }
    return '';
  }, [rowId, colId]);
}

export async function readCellBackground(page: Page, rowId: string, colId: string): Promise<string> {
  return page.evaluate(([r, c]) => {
    const rows = document.querySelectorAll(`.ag-row[row-id="${CSS.escape(r)}"]`);
    for (const row of rows) {
      const cell = row.querySelector(`.ag-cell[col-id="${CSS.escape(c)}"]`) as HTMLElement | null;
      if (cell) return getComputedStyle(cell).backgroundColor;
    }
    return '';
  }, [rowId, colId]);
}

export async function readCellFontWeight(page: Page, rowId: string, colId: string): Promise<string> {
  return page.evaluate(([r, c]) => {
    const rows = document.querySelectorAll(`.ag-row[row-id="${CSS.escape(r)}"]`);
    for (const row of rows) {
      const cell = row.querySelector(`.ag-cell[col-id="${CSS.escape(c)}"]`) as HTMLElement | null;
      if (cell) return getComputedStyle(cell).fontWeight;
    }
    return '';
  }, [rowId, colId]);
}

/** Returns true if the cell has any class matching `classNamePattern`. */
export async function cellHasClassMatching(page: Page, rowId: string, colId: string, pattern: RegExp): Promise<boolean> {
  const classes = await page.evaluate(([r, c]) => {
    const rows = document.querySelectorAll(`.ag-row[row-id="${CSS.escape(r)}"]`);
    for (const row of rows) {
      const cell = row.querySelector(`.ag-cell[col-id="${CSS.escape(c)}"]`);
      if (cell) return Array.from(cell.classList);
    }
    return [];
  }, [rowId, colId]);
  return classes.some((c) => pattern.test(c));
}

void findCellInDom;

/** Whether the row carries any `ds-rule-*` class — handy probe for
 *  row-scope conditional styling. */
export async function rowHasAnyRuleClass(page: Page, rowId: string): Promise<string[]> {
  return page.evaluate((r) => {
    const row = document.querySelector(`.ag-row[row-id="${r}"]`);
    if (!row) return [];
    return Array.from(row.classList).filter((c) => c.startsWith('ds-rule-'));
  }, rowId);
}

/**
 * Assert that the calculated column with the given (raw) colId rendered
 * AND its first row's value matches the expected text.
 */
export async function expectCalcColumn(page: Page, rowId: string, colId: string, expectedText: RegExp | string): Promise<void> {
  await expect.poll(
    () => readCellText(page, rowId, colId),
    { timeout: 5_000, message: `calc column ${colId} should render for row ${rowId}` },
  ).not.toBeNull();
  const text = await readCellText(page, rowId, colId);
  if (text === null) throw new Error(`Calc column ${colId} not found for row ${rowId}`);
  if (typeof expectedText === 'string') {
    expect(text).toBe(expectedText);
  } else {
    expect(text).toMatch(expectedText);
  }
}

/**
 * Read the list of colIds AG-Grid knows about, regardless of column
 * virtualization. Walks the React fiber tree to find the GridApi and
 * calls `getAllGridColumns()`. Falls back to a DOM-only scan if the
 * fiber walk can't find the api (test should still fail clearly).
 */
export async function readAllColumnIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return [];
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return [];
    let fiber = (root as unknown as Record<string, unknown>)[fiberKey] as { return?: unknown; memoizedState?: unknown; stateNode?: { api?: unknown } } | null;
    for (let i = 0; i < 80 && fiber; i++) {
      const candidates: Array<{ getAllGridColumns?: () => Array<{ getColId(): string }> }> = [];
      const sn = (fiber as { stateNode?: unknown }).stateNode as { api?: unknown } | null;
      if (sn && typeof sn === 'object' && 'api' in sn) candidates.push(sn.api as never);
      const mem = (fiber as { memoizedState?: unknown }).memoizedState as { memoizedState?: unknown; next?: unknown } | null;
      let s = mem;
      while (s) {
        const sm = (s as { memoizedState?: unknown }).memoizedState;
        if (sm && typeof sm === 'object') {
          if ('api' in (sm as object)) candidates.push((sm as { api: unknown }).api as never);
          if ('current' in (sm as object) && (sm as { current?: { api?: unknown } }).current?.api) {
            candidates.push((sm as { current: { api: unknown } }).current.api as never);
          }
        }
        s = (s as { next?: unknown }).next as typeof mem;
      }
      for (const api of candidates) {
        if (api && typeof api.getAllGridColumns === 'function') {
          try { return api.getAllGridColumns().map((c) => c.getColId()); } catch { /* */ }
        }
      }
      fiber = (fiber as { return?: unknown }).return as typeof fiber;
    }
    return [];
  });
}

/**
 * Scroll the grid horizontally to the far right so virtualised columns
 * mount in the DOM. Use before asserting on header cells whose col-id
 * sits past the viewport edge.
 */
export async function scrollGridToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const v = document.querySelector('.ag-body-horizontal-scroll-viewport') as HTMLElement | null;
    if (v) v.scrollLeft = v.scrollWidth;
  });
  await page.waitForTimeout(250);
}

/** AG-Grid auto-suffixes group cells with `_N` when the group repeats;
 *  match by prefix on the col-id. */
export async function columnGroupHeaderVisible(page: Page, groupId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const cells = Array.from(document.querySelectorAll('.ag-header-group-cell'));
    return cells.some((c) => {
      const colId = c.getAttribute('col-id') ?? '';
      return colId === id || colId.startsWith(`${id}_`);
    });
  }, groupId);
}

/**
 * Read the headerName text rendered for a group whose colId starts
 * with `groupId`. Useful for asserting the editor-authored headerName
 * survived the transform pipeline.
 */
export async function columnGroupHeaderText(page: Page, groupId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const cells = Array.from(document.querySelectorAll('.ag-header-group-cell'));
    const cell = cells.find((c) => {
      const colId = c.getAttribute('col-id') ?? '';
      return colId === id || colId.startsWith(`${id}_`);
    });
    if (!cell) return null;
    const label = cell.querySelector('.ag-header-group-cell-label');
    return label ? (label.textContent ?? '').trim() : null;
  }, groupId);
}

/** `getComputedStyle` on the group-header cell for assertion of
 *  custom headerStyle (background / colour / weight). */
export async function readGroupHeaderStyle(
  page: Page,
  groupId: string,
): Promise<{ bg: string; color: string; fontWeight: string } | null> {
  return page.evaluate((id) => {
    const cells = Array.from(document.querySelectorAll('.ag-header-group-cell'));
    const cell = cells.find((c) => {
      const colId = c.getAttribute('col-id') ?? '';
      return colId === id || colId.startsWith(`${id}_`);
    }) as HTMLElement | undefined;
    if (!cell) return null;
    const cs = getComputedStyle(cell);
    return { bg: cs.backgroundColor, color: cs.color, fontWeight: cs.fontWeight };
  }, groupId);
}
