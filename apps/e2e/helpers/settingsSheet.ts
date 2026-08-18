import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for navigating the settings sheet in Playwright tests.
 *
 * Trimmed when the demo-react specs went: the boot helpers here
 * (`bootCleanDemo` / `waitForV2Grid` / `clearV2Storage`) waited on
 * `[data-grid-id="demo-blotter-v2"]`, a grid no surviving app renders, and
 * the panel helpers built on them had no callers left. What remains is what
 * the lab-app specs use.
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
 * Navigation goes through the visible path (`navigateToModule`), because that
 * exercises the actual user flow.
 */

/**
 * Boots the demo at a known-clean state: grid rendered, profile storage
 * wiped, fresh reload. Use this in `beforeEach` for any test that
 * depends on starting from no prior overrides.
 */
/**
 * Opens the primary toolbar ⋯ overflow menu. Idempotent.
 *
 * The trigger TOGGLES. Clicking it unconditionally closes a menu that was
 * already open, after which `v2-settings-open-btn` is not in the DOM and the
 * click below waits out the whole test timeout. Specs that open the settings
 * sheet once per test never saw it; the profile-isolation specs, which open it
 * several times per test, hung on every second open.
 */
async function openToolbarOverflowMenu(page: Page): Promise<void> {
  const settingsItem = page.locator('[data-testid="v2-settings-open-btn"]');
  if (await settingsItem.isVisible().catch(() => false)) return;
  await page.locator('[data-testid="toolbar-more-menu-trigger"]').click();
  await expect(settingsItem).toBeVisible({ timeout: 10_000 });
}

/** Opens Grid settings from the toolbar overflow menu (does not wait for sheet). */
export async function clickSettingsFromToolbar(page: Page): Promise<void> {
  await openToolbarOverflowMenu(page);
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
}

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
  // The menu content animates open; under parallel-worker load the item
  // can stay "not stable" past a single click's patience. Bound each
  // click attempt and re-open the menu between attempts.
  for (let attempt = 0; ; attempt += 1) {
    const item = await openModuleMenu(page, targetModuleId);
    const clicked = await item.click({ timeout: 5_000 }).then(() => true, () => false);
    if (clicked) break;
    if (attempt >= 2) throw new Error(`could not click settings nav item "${targetModuleId}"`);
    await page.keyboard.press('Escape');
  }
  if (sectionId) {
    const tab = page.locator(`[data-testid="editing-section-tab-${sectionId}"]`);
    await tab.waitFor({ state: 'visible', timeout: 10_000 });
    await tab.click();
  }
}
