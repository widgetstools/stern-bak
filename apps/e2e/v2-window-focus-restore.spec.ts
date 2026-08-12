import { test, expect, type Page } from '@playwright/test';

/**
 * Window-focus cell restoration e2e — lab Editing tab (:5300).
 *
 * Covers `useRestoreCellFocusOnWindowFocus` (@wellsfargo-starui/grid): when the
 * window regains OS focus after DOM focus was dropped back to `<body>`
 * (the OpenFin alt-tab failure mode), the grid surface re-asserts real
 * browser focus on the cell AG Grid still reports as focused, so
 * Ctrl+V / typing works without re-clicking the cell.
 *
 * Playwright can't alt-tab the real OS window, so the broken state is
 * simulated directly: blur the active element (focus falls to <body>
 * while AG Grid keeps painting the focus ring — exactly what the
 * container produces) and then dispatch a window `focus` event.
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-editing';
const SEED_FLAG_KEY = `lab-demo-profiles-v2:${GRID_ID}`;

async function clearLabStorage(page: Page): Promise<void> {
  await page.evaluate((flagKey) => {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith('markets-grid-bundle:lab-') ||
          k.startsWith('gc-active-profile:lab-') ||
          k.startsWith('lab-demo-profiles-'),
      )
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(flagKey);
  }, SEED_FLAG_KEY);
}

async function bootEditingTab(page: Page): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-editing"]').click();
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 15_000 });
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"] .ag-grid-viewport .ag-row`, {
    timeout: 15_000,
  });
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === '1',
    SEED_FLAG_KEY,
    { timeout: 20_000 },
  );
}

/** col-id of the .ag-cell containing the active element, or null. */
async function activeCellColId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.closest('.ag-cell')?.getAttribute('col-id') ?? null,
  );
}

async function dropFocusToBodyAndRefocusWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test.describe('window-focus cell restoration', () => {
  test('re-focuses the focused cell after window refocus drops activeElement to <body>', async ({ page }) => {
    await bootEditingTab(page);

    const cell = page.locator(
      `[data-grid-id="${GRID_ID}"] .ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]`,
    );
    await cell.click();
    await expect.poll(() => activeCellColId(page), { timeout: 5000 }).toBe('quantityFace');

    await dropFocusToBodyAndRefocusWindow(page);

    // The focus ring survives the blur (AG state), and the hook must
    // bring the real DOM focus back to the same cell.
    await expect.poll(() => activeCellColId(page), { timeout: 5000 }).toBe('quantityFace');
  });

  test('does not steal focus that deliberately moved outside the grid', async ({ page }) => {
    await bootEditingTab(page);

    const cell = page.locator(
      `[data-grid-id="${GRID_ID}"] .ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]`,
    );
    await cell.click();
    await expect.poll(() => activeCellColId(page), { timeout: 5000 }).toBe('quantityFace');

    // User moves focus to a toolbar control (outside the grid surface).
    await page.evaluate(() => {
      document
        .querySelector<HTMLElement>('[data-testid="profile-selector-trigger"]')
        ?.focus();
    });
    expect(await activeCellColId(page)).toBeNull();

    await dropFocusToBodyAndRefocusWindow(page);

    // Restoration must not fire — the grid released focus ownership.
    await page.waitForTimeout(250);
    expect(await activeCellColId(page)).toBeNull();
  });
});
