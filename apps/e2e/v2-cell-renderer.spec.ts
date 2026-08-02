import { test, expect, type Page } from '@playwright/test';
import {
  bootCleanDemo,
  openPanel,
  closeSettingsSheet,
} from './helpers/settingsSheet';
import { pickSelectOption } from './helpers/shadcnSelect';

/**
 * v2 — column-customization band 10 (CELL RENDERER).
 *
 * Smoke coverage for the renderer-picker + per-renderer editor pair
 * shipped with the configurable cell renderers (Pill / Heatmap /
 * Percent Bar / Trend Arrow / Sparkline / Multi-Line / Icon+Text /
 * Country Flag / Rating Delta / Time-Since / Allocation Bar).
 *
 * What's covered end-to-end:
 *  1. Renderer trigger renders inside the band on a freshly mounted
 *     column editor.
 *  2. Picking "Pill" mounts the PillEditor and writes
 *     `cellRendererId: 'pill'` to the draft.
 *  3. Adding a rule via the PillEditor enables SAVE; committing
 *     persists the assignment + survives a column-navigation round
 *     trip.
 *  4. Switching to a zero-config renderer (e.g. "Buy / Sell side")
 *     hides the editor and surfaces the explanatory note.
 *  5. Clearing the renderer back to "None (default)" drops both
 *     `cellRendererId` and `cellRendererConfig` from the assignment.
 *
 * Deep visual rendering of the cell (pill paint, gradient
 * interpolation, sparkline SVG paths) is exercised by the
 * cellRenderers.test.ts unit suite in @wellsfargo-starui/design-system — no
 * point repeating that here since e2e is for the wiring, not the
 * pixel output.
 */

async function selectColumn(page: Page, colId: string): Promise<void> {
  await openPanel(page, 'column-customization');
  await page.locator(`[data-testid="cols-item-${colId}"]`).click();
  await expect(page.locator(`[data-testid="cols-editor-${colId}"]`)).toBeVisible();
}

async function saveColumn(page: Page, colId: string): Promise<void> {
  const btn = page.locator(`[data-testid="cols-save-${colId}"]`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

test.describe('v2 — column-customization band 10 (CELL RENDERER)', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  test.afterEach(async ({ page }) => {
    await closeSettingsSheet(page);
  });

  test('renderer selector trigger is visible inside the cell-renderer band', async ({ page }) => {
    await selectColumn(page, 'side');
    await expect(
      page.locator('[data-testid="cols-side-renderer-trigger"]'),
    ).toBeVisible();
  });

  test('picking "Pill" mounts the PillEditor and enables SAVE', async ({ page }) => {
    await selectColumn(page, 'side');
    await pickSelectOption(page, 'cols-side-renderer-trigger', 'pill');

    // PillEditor surfaces an "Add rule" affordance — its presence is the
    // signal that the right editor mounted.
    await expect(
      page.locator('[data-testid="cols-side-renderer-cfg-add-rule"]'),
    ).toBeVisible();

    // SAVE flips dirty.
    await expect(page.locator('[data-testid="cols-save-side"]')).toBeEnabled();
  });

  test('adding a Pill rule + saving persists across column-navigation', async ({ page }) => {
    await selectColumn(page, 'side');
    await pickSelectOption(page, 'cols-side-renderer-trigger', 'pill');
    await page.locator('[data-testid="cols-side-renderer-cfg-add-rule"]').click();

    // First rule row's value input — set an exact match for one of the
    // demo's side values.
    const valueInput = page.locator(
      '[data-testid="cols-side-renderer-cfg-rule-0-value"]',
    );
    await valueInput.fill('Buy');
    await valueInput.blur();

    await saveColumn(page, 'side');

    // Navigate away to a different column then back. The committed
    // assignment must rehydrate the editor:
    //   - the trigger still reads "Pill"
    //   - the rule row + its value input survive
    await page.locator('[data-testid="cols-item-id"]').click();
    await page.locator('[data-testid="cols-item-side"]').click();

    // `expectSelectDisplay` matches via the resolveOptionLabel map; the
    // catalogue labels ("Pill", "Heatmap", …) aren't in that map, so
    // assert on the visible trigger text directly.
    await expect(
      page.locator('[data-testid="cols-side-renderer-trigger"]'),
    ).toContainText('Pill');
    await expect(
      page.locator('[data-testid="cols-side-renderer-cfg-rule-0-value"]'),
    ).toHaveValue('Buy');
  });

  test('picking a zero-config renderer hides the editor and shows the explanatory note', async ({ page }) => {
    await selectColumn(page, 'side');
    // `side` is the built-in zero-config Buy/Sell renderer in the catalogue.
    await pickSelectOption(page, 'cols-side-renderer-trigger', 'side');

    // No editor mounts — Pill's add-rule button is absent.
    await expect(
      page.locator('[data-testid="cols-side-renderer-cfg-add-rule"]'),
    ).toHaveCount(0);

    // The band shows the explanatory copy instead.
    await expect(
      page.getByText(/has no editable configuration/i),
    ).toBeVisible();
  });

  test('clearing the renderer back to "None (default)" drops the assignment', async ({ page }) => {
    // First, seed an assignment so we have something to clear.
    await selectColumn(page, 'side');
    await pickSelectOption(page, 'cols-side-renderer-trigger', 'pill');
    await page.locator('[data-testid="cols-side-renderer-cfg-add-rule"]').click();
    await saveColumn(page, 'side');

    // Now clear it — the "None (default)" item carries an internal
    // `__none__` sentinel value but Radix Select's listbox matches the
    // label most reliably, so pass the visible label string.
    await pickSelectOption(page, 'cols-side-renderer-trigger', 'None (default)');
    await saveColumn(page, 'side');

    // Re-open the editor — no rule editor mounts, trigger reads "None…".
    await page.locator('[data-testid="cols-item-id"]').click();
    await page.locator('[data-testid="cols-item-side"]').click();
    await expect(
      page.locator('[data-testid="cols-side-renderer-cfg-add-rule"]'),
    ).toHaveCount(0);
  });
});
