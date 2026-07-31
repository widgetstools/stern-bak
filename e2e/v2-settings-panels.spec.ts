import { test, expect } from '@playwright/test';
import {
  bootCleanDemo,
  openPanel,
  forceNavigateToPanel,
  closeSettingsSheet,
  openSettingsSheet,
  PANEL_ROOT_TESTID,
  type PanelModuleId,
} from './helpers/settingsSheet';

/**
 * Smoke coverage for every v2 settings panel. One test per module that:
 *
 *   1. Opens the sheet via the Settings button
 *   2. Navigates to the panel using the visible grouped menubar
 *      (group trigger → `v2-settings-nav-menu-<id>` item)
 *   3. Asserts the panel's root testid becomes visible
 *   4. Closes the sheet via ESC
 *
 * This is the minimum safety net the audit refactors left behind:
 * previously zero panels had any e2e coverage except a single
 * conditional-styling smoke. These tests don't exercise any editor
 * behaviour — they only prove the panel mounts and the nav works.
 *
 * Per `e2e/README.md`: new behavioural tests land alongside feature
 * changes. This file stays as permanent scaffolding — extend the
 * `PanelModuleId` / `PANEL_ROOT_TESTID` arrays in the helper when a new
 * module gets a settings panel.
 */

const MODULES: Array<{ id: PanelModuleId; label: string }> = [
  { id: 'general-settings', label: 'Grid Options' },
  { id: 'column-customization', label: 'Column Settings' },
  { id: 'calculated-columns', label: 'Calculated Columns' },
  { id: 'column-groups', label: 'Column Groups' },
  { id: 'conditional-styling', label: 'Style Rules' },
];

/** Module ids with settings UI but not yet in `PanelModuleId` (alerts). */
const EXTRA_DROPDOWN_MODULES = [
  { id: 'alerts', label: 'Alerts' },
] as const;

test.describe('v2 — settings panels smoke', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  for (const { id, label } of MODULES) {
    test(`${label} panel mounts via menubar nav`, async ({ page }) => {
      await openPanel(page, id);
      await expect(page.locator(`[data-testid="${PANEL_ROOT_TESTID[id]}"]`)).toBeVisible();
      await closeSettingsSheet(page);
    });
  }

  test('settings module menubar exposes every panel', async ({ page }) => {
    await openSettingsSheet(page);
    await expect(page.locator('[data-testid="v2-settings-module-menubar"]')).toBeVisible();
    // Each module is reachable through exactly one group menu — open the
    // owning menu (via the trigger's data-modules list), assert the item,
    // and dismiss before checking the next module.
    for (const { id } of [...MODULES, ...EXTRA_DROPDOWN_MODULES]) {
      await page
        .locator(`[data-testid^="v2-settings-nav-group-"][data-modules~="${id}"]`)
        .click();
      await expect(
        page.locator(`[data-testid="v2-settings-nav-menu-${id}"]`),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await closeSettingsSheet(page);
  });

  test('accessible hidden nav (screen-reader path) remains in the DOM', async ({ page }) => {
    // The hidden nav at `v2-settings-nav-<id>` is the a11y surface. It
    // lives permanently in the sheet's DOM (opacity:0, 1×1px). This test
    // guards against accidental deletion during chrome refactors.
    await openSettingsSheet(page);
    for (const { id } of MODULES) {
      await expect(
        page.locator(`[data-testid="v2-settings-nav-${id}"]`),
      ).toHaveCount(1);
    }
    await closeSettingsSheet(page);
  });

  test('forceNavigateToPanel helper works as a fallback path', async ({ page }) => {
    // Regression guard: `forceNavigateToPanel` uses { force: true } on
    // the hidden nav to bypass pointer-events interception. If the sheet
    // ever changes so the hidden nav loses its click handler, this test
    // catches it — distinct from the dropdown-based `openPanel` flow.
    await forceNavigateToPanel(page, 'column-groups');
    await expect(page.locator('[data-testid="cg-panel"]')).toBeVisible();
    await closeSettingsSheet(page);
  });
});
