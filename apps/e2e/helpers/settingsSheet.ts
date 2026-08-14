import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for navigating the v2 settings sheet in Playwright tests.
 *
 * Settings-sheet navigation subtleties the helpers paper over:
 *
 *   1. `data-testid="v2-settings-nav-<id>"` buttons are a HIDDEN accessible
 *      nav: 1px × 1px with opacity:0. Screen readers see them; `click()`
 *      with pointer-events fails because the 5 buttons stack at
 *      overlapping coordinates and Playwright's built-in pointer-event
 *      check rejects the intercepting sibling. Using `{ force: true }`
 *      on THIS testid bypasses that check — safe because the button IS
 *      wired to an onClick handler.
 *
 *   2. The VISIBLE nav is a grouped shadcn Menubar
 *      (`v2-settings-module-menubar`): five category triggers
 *      (`v2-settings-nav-group-<group>`) each opening a menu of module
 *      items (`v2-settings-nav-menu-<id>`). Each trigger carries a
 *      space-separated `data-modules` attribute listing the module ids
 *      it owns, so `navigateToModule` can resolve the owning menu with a
 *      CSS `~=` selector instead of duplicating the grouping map here.
 *
 * We default to the visible path (`openPanel` / `navigateToModule`)
 * because it exercises the actual user flow. `forceNavigateToPanel` is
 * the escape hatch when a test needs to trigger navigation from an edge
 * case (e.g. while a Popover is open).
 */

export const V2_PATH = '/';

export async function waitForV2Grid(page: Page): Promise<void> {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-grid-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(400); // initial Default-profile auto-seed
}

export async function clearV2Storage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('marketsui-config');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('profile-migration-v1');
  });
}

/**
 * Boots the demo at a known-clean state: grid rendered, profile storage
 * wiped, fresh reload. Use this in `beforeEach` for any test that
 * depends on starting from no prior overrides.
 */
export async function bootCleanDemo(page: Page): Promise<void> {
  await page.goto(V2_PATH);
  await waitForV2Grid(page);
  await clearV2Storage(page);
  await page.goto(V2_PATH);
  await waitForV2Grid(page);
}

/** Opens the primary toolbar ⋯ overflow menu. */
export async function openToolbarOverflowMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="toolbar-more-menu-trigger"]').click();
}

/** Opens Grid settings from the toolbar overflow menu (does not wait for sheet). */
export async function clickSettingsFromToolbar(page: Page): Promise<void> {
  await openToolbarOverflowMenu(page);
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
}

/** Opens the Grid info dialog from the toolbar overflow menu. */
export async function openGridInfoDialog(page: Page): Promise<void> {
  await openToolbarOverflowMenu(page);
  await page.locator('[data-testid="grid-info-btn"]').click();
}

/** Opens the settings sheet via the header Settings button. Idempotent. */
export async function openSettingsSheet(page: Page): Promise<void> {
  const sheet = page.locator('.ds-sheet');
  if (await sheet.isVisible().catch(() => false)) return;
  await clickSettingsFromToolbar(page);
  await expect(sheet).toBeVisible();
}

/** Closes the settings sheet via ESC. Waits for full unmount. */
export async function closeSettingsSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="v2-settings-sheet"]')).toHaveCount(0);
}

/**
 * Canonical module ids exposed by the settings nav. Keep in sync with the
 * keys on `Module.SettingsPanel` definitions in `packages/core/src/modules/`.
 */
export type PanelModuleId =
  | 'general-settings'
  | 'column-customization'
  | 'calculated-columns'
  | 'column-groups'
  | 'conditional-styling';

/**
 * Expected panel-root testid per module. Each is the wrapper the panel
 * renders at the top of its tree, the standard assertion anchor after
 * navigating.
 */
export const PANEL_ROOT_TESTID: Record<PanelModuleId, string> = {
  // Grid Options panel — historical `go-` prefix (for "grid options"),
  // preserved even though the module id is `general-settings`.
  'general-settings': 'go-panel',
  'column-customization': 'cols-panel',
  'calculated-columns': 'cc-panel',
  'column-groups': 'cg-panel',
  'conditional-styling': 'cs-panel',
};

/**
 * The four pre-merge editing module ids now live as SECTIONS inside the
 * merged `editing` module's panel. Navigating to one of them means:
 * open the `editing` panel, then click its section tab.
 */
const EDITING_SECTION_IDS = new Set(['smart-edit', 'bulk-update', 'plus-minus', 'shortcuts']);

/**
 * Opens the menubar menu owning `moduleId` (resolved through the group
 * trigger's `data-modules` attribute) and returns the module item's
 * locator once it is mounted. The sheet slides in, so a group click
 * dispatched mid-animation can land on a neighbouring trigger — verify
 * the intended item actually mounted and Escape + retry when it didn't.
 */
export async function openModuleMenu(page: Page, moduleId: string) {
  const item = page.locator(`[data-testid="v2-settings-nav-menu-${moduleId}"]`);
  for (let attempt = 0; ; attempt += 1) {
    if (!(await item.isVisible().catch(() => false))) {
      await page
        .locator(`[data-testid^="v2-settings-nav-group-"][data-modules~="${moduleId}"]`)
        .click();
    }
    const mounted = await item
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true, () => false);
    if (mounted) return item;
    if (attempt >= 2) {
      throw new Error(`settings nav item for "${moduleId}" did not appear after ${attempt + 1} attempts`);
    }
    await page.keyboard.press('Escape');
  }
}

/**
 * Navigates to a module via the visible grouped menubar — opens the
 * category menu owning `moduleId`, then clicks the module item. Assumes
 * the settings sheet is already open. Works on popout `Page`s too.
 */
export async function navigateToModule(page: Page, moduleId: string): Promise<void> {
  const sectionId = EDITING_SECTION_IDS.has(moduleId) ? moduleId : null;
  const targetModuleId = sectionId ? 'editing' : moduleId;
  const item = await openModuleMenu(page, targetModuleId);
  await item.click();
  if (sectionId) {
    const tab = page.locator(`[data-testid="editing-section-tab-${sectionId}"]`);
    await tab.waitFor({ state: 'visible', timeout: 10_000 });
    await tab.click();
  }
}

/**
 * Opens the settings sheet (if closed) and navigates to the given
 * module's panel via the visible menubar — the realistic user path.
 * Waits for the panel root testid to become visible before returning.
 */
export async function openPanel(page: Page, moduleId: PanelModuleId): Promise<void> {
  await openSettingsSheet(page);

  // If already on the target panel, no-op.
  const rootTestid = PANEL_ROOT_TESTID[moduleId];
  if (await page.locator(`[data-testid="${rootTestid}"]`).isVisible().catch(() => false)) {
    return;
  }

  await navigateToModule(page, moduleId);
  await expect(page.locator(`[data-testid="${rootTestid}"]`)).toBeVisible();
}

/**
 * Bypasses the visible dropdown and navigates via the hidden accessible
 * nav. Use only when the dropdown interaction itself is out of scope
 * (e.g. a test that's already inside a Popover and doesn't want to
 * close it).
 *
 * The hidden nav is 1px square with `overflow: hidden` on its wrapper,
 * so `click({ force: true })` still fails Playwright's viewport check.
 * We dispatch a synthetic `click` event directly on the element — the
 * button's React onClick handler fires the same way as a real click.
 */
export async function forceNavigateToPanel(
  page: Page,
  moduleId: PanelModuleId,
): Promise<void> {
  await openSettingsSheet(page);
  await page
    .locator(`[data-testid="v2-settings-nav-${moduleId}"]`)
    .evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.locator(`[data-testid="${PANEL_ROOT_TESTID[moduleId]}"]`)).toBeVisible();
}
