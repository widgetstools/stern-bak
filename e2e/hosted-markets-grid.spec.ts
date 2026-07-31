import { test, expect, type Page } from '@playwright/test';
import { navigateToModule, openGridInfoDialog, openSettingsSheet } from './helpers/settingsSheet';

/**
 * E2E — HostedMarketsGrid integration spec.
 *
 * Targets the reference app's `/blotters/marketsgrid` route at
 * http://localhost:5174 — the route that hosts a MarketsGrid via
 * `HostedFeatureView` today (pre-migration) and `<HostedMarketsGrid>`
 * post-session-7. The spec must remain green through that swap; the
 * assertions all hit the wrapper boundary (grid mount, profile
 * selector, provider-picker chord, info popover, theme flip) and the
 * inner `MarketsGrid` selectors which are framework-stable.
 *
 * Storage hygiene: the reference app's ConfigManager singleton resolves
 * to the Dexie database `marketsui-config`. We wipe it (and the
 * `gc-active-profile:*` localStorage pointers + the `theme` key) before
 * each test so order-independence holds.
 *
 * Coverage notes:
 *   - "Grid renders" asserts the `data-grid-id` wrapper + AG-Grid root
 *     mount. The session-6 plan called for "≥ 1 row", but the reference
 *     app does not seed a default DataProvider — without one selected,
 *     the grid's "no provider" placeholder shows zero rows. The plan
 *     pre-dates that observation; "grid mounts cleanly" exercises the
 *     same wrapper boundary at the right level of detail.
 *   - Theme flip is driven by the `theme` localStorage key (read once
 *     on ThemeProvider mount), so the test sets it then reloads. The
 *     useAgGridTheme hook responds to the resulting `data-theme`
 *     attribute change (post-migration) and to the React ThemeContext
 *     value (pre- and post-migration), so background colour observably
 *     differs between the two themes either way.
 */

const BLOTTER_URL = 'http://localhost:5174/blotters/marketsgrid';
const GRID_ID = 'markets-ui-reference-blotter';
const DEXIE_DB_NAME = 'marketsui-config';

async function clearReferenceStorage(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:') || k === 'theme' || k === 'hosted-mg.legacy-cleanup')
      .forEach((k) => localStorage.removeItem(k));
  }, DEXIE_DB_NAME);
}

async function waitForBlotter(page: Page): Promise<void> {
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 20_000 });
  // AG-Grid's root wrapper renders even without rows (placeholder grid).
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"] .ag-root-wrapper`, { timeout: 15_000 });
  // Profile selector trigger is the most reliable "MarketsGrid toolbar
  // mounted" signal — appears once profiles have loaded from storage
  // (Default is auto-seeded if none exist).
  await page.waitForSelector('[data-testid="profile-selector-trigger"]', { timeout: 15_000 });
}

async function bootCleanBlotter(page: Page): Promise<void> {
  await page.goto(BLOTTER_URL);
  await waitForBlotter(page);
  await clearReferenceStorage(page);
  await page.goto(BLOTTER_URL);
  await waitForBlotter(page);
}

test.describe('hosted-markets-grid integration', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanBlotter(page);
  });

  test('grid mounts and shows the Default profile', async ({ page }) => {
    await expect(page.locator(`[data-grid-id="${GRID_ID}"]`)).toBeVisible();
    await expect(page.locator(`[data-grid-id="${GRID_ID}"] .ag-root-wrapper`)).toBeVisible();
    await expect(page.locator('[data-testid="profile-selector-trigger"]')).toContainText('Default');
    // Save indicator should NOT show a dirty dot in a clean boot state.
    await expect(page.locator('[data-testid="save-all-dirty"]')).toHaveCount(0);
  });

  test('profile lifecycle — create, switch back, dirty dot stays clear', async ({ page }) => {
    const trigger = page.locator('[data-testid="profile-selector-trigger"]');

    // Create a new profile via the popover.
    await trigger.click();
    await expect(page.locator('[data-testid="profile-selector-popover"]')).toBeVisible();
    await page.locator('[data-testid="profile-name-input"]').fill('E2E-Hosted');
    await page.locator('[data-testid="profile-create-btn"]').click();
    await expect(trigger).toContainText('E2E-Hosted');
    // ProfileManager.create() is an explicit write — no dirty dot.
    await expect(page.locator('[data-testid="save-all-dirty"]')).toHaveCount(0);

    // Switch back to Default.
    await trigger.click();
    await page.locator('[data-testid="profile-row-__default__"]').click();
    await expect(trigger).toContainText('Default');
    await expect(page.locator('[data-testid="save-all-dirty"]')).toHaveCount(0);
  });

  test('Custom Settings exposes data provider controls', async ({ page }) => {
    await openSettingsSheet(page);
    await navigateToModule(page, 'toolbar-date-settings');
    await expect(page.locator('[data-testid="provider-grid-host-section"]')).toBeVisible();
    await expect(page.getByTestId('provider-live-select').first()).toBeVisible();
    await expect(page.locator('[data-testid="tds-enabled"]')).toBeVisible();
    await expect(page.locator('[data-testid="provider-refresh-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="provider-reload-from-source"]')).toBeVisible();
  });

  test('grid info popover surfaces path / instanceId / gridId', async ({ page }) => {
    await openGridInfoDialog(page);
    // Popover content is unscoped — match by label cells.
    const popover = page.locator('[data-ds-settings]').filter({ hasText: 'instanceId' });
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('/blotters/marketsgrid');
    await expect(popover).toContainText(GRID_ID);
  });

  test('theme flip — data-theme attribute and grid background change', async ({ page }) => {
    // Boot defaults to dark; capture dark background.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkBg = await page.evaluate(() => {
      const el = document.querySelector('.ag-root-wrapper') as HTMLElement | null;
      return el ? getComputedStyle(el).backgroundColor : '';
    });
    expect(darkBg).not.toBe('');

    // Flip via localStorage + reload — ThemeProvider reads it on mount.
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.reload();
    await waitForBlotter(page);

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightBg = await page.evaluate(() => {
      const el = document.querySelector('.ag-root-wrapper') as HTMLElement | null;
      return el ? getComputedStyle(el).backgroundColor : '';
    });
    expect(lightBg).not.toBe('');
    expect(lightBg).not.toBe(darkBg);
  });
});
