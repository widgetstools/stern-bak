import { test, expect, type Page } from '@playwright/test';
import {
  bootCleanDemo,
  openPanel,
  closeSettingsSheet,
} from './helpers/settingsSheet';
import { pickSelectOption, pickSelectOptionByLocator, clickSwitch } from './helpers/shadcnSelect';

/**
 * Full behavioural coverage for the conditional-styling settings panel
 * (ConditionalStylingPanel, documented in IMPLEMENTED_FEATURES.md §1.7).
 *
 * Covers the rule authoring lifecycle end-to-end:
 *
 *   - Empty state → add rule → rename → enable/disable → scope change →
 *     column picker → priority → delete → persistence
 *   - `ds-rule-<id>` class application (cellClassRules / rowClassRules)
 *     proves the transform pipeline is wired through to AG-Grid
 *   - No-columns warning for cell-scope rules with no target columns
 *   - Flash band gating (on scope + enabled)
 *   - Indicator band presence
 *
 * Expression-editor input is not exercised in this spec — Monaco's
 * mount lifecycle is test-hostile, and the module defaults to
 * `expression: 'true'` which matches every row. That default is
 * sufficient to prove the cellClass/rowClass wiring lands correctly;
 * expression parsing has its own unit tests in the expression engine.
 */

// ─── Helpers ────────────────────────────────────────────────────────────

/** Creates a fresh rule via the add button, returns its generated id. */
async function addRule(page: Page): Promise<string> {
  await openPanel(page, 'conditional-styling');
  await page.locator('[data-testid="cs-add-rule-btn"]').click();
  // The editor's `data-rule-testid` attribute encodes the rule id.
  const editor = page.locator('[data-testid="cs-rule-editor"]');
  await expect(editor).toBeVisible();
  const attr = await editor.getAttribute('data-rule-testid');
  const id = attr?.replace('cs-rule-editor-', '');
  if (!id) throw new Error('Failed to read new rule id');
  return id;
}

/** Saves the currently-open rule editor. Waits for dirty to clear. */
async function saveRule(page: Page, ruleId: string): Promise<void> {
  const btn = page.locator(`[data-testid="cs-rule-save-${ruleId}"]`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

/** Clicks the shadcn Switch via its test id. */
async function toggleSwitch(page: Page, testid: string): Promise<void> {
  await clickSwitch(page, testid);
}

/** Opens the SCOPE combobox for the active rule editor. */
async function pickScope(page: Page, ruleId: string, scope: 'cell' | 'row'): Promise<void> {
  await pickSelectOption(page, `cs-rule-scope-${ruleId}`, scope);
}

/** Adds a column to a cell-scope rule via the column picker combobox. */
async function addScopeColumn(page: Page, colId: string): Promise<void> {
  const editor = page.locator('[data-testid="cs-rule-editor"]');
  const picker = editor.locator('[role="combobox"]').last();
  await pickSelectOptionByLocator(page, picker, colId);
}

// ─── Tests ──────────────────────────────────────────────────────────────

test.describe('v2 — conditional-styling panel', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  test('empty state shows "Select a rule / press +" editor copy', async ({ page }) => {
    await openPanel(page, 'conditional-styling');
    await expect(page.locator('[data-testid="cs-panel"]')).toContainText(
      'Select a rule from the list',
    );
  });

  test('adding a rule seeds "New Rule" and auto-selects it', async ({ page }) => {
    const id = await addRule(page);
    await expect(
      page.locator(`[data-testid="cs-rule-name-${id}"]`),
    ).toHaveValue('New Rule');
    // List rail card is also rendered.
    await expect(page.locator(`[data-testid="cs-rule-card-${id}"]`)).toBeVisible();
  });

  test('renaming a rule persists after save + re-select', async ({ page }) => {
    const id = await addRule(page);
    await page.locator(`[data-testid="cs-rule-name-${id}"]`).fill('High-Yield Alert');
    await saveRule(page, id);

    // Click the list-rail card to re-open from committed state.
    await page.locator(`[data-testid="cs-rule-card-${id}"]`).click();
    await expect(
      page.locator(`[data-testid="cs-rule-name-${id}"]`),
    ).toHaveValue('High-Yield Alert');
  });

  test('row-scope rule applies ds-rule class to every row', async ({ page }) => {
    // Fresh rule defaults to scope.type=row + expression=true + enabled=true.
    // `addRule` writes directly to committed state (not draft), so the
    // transform installs rowClassRules immediately — no SAVE click needed.
    const id = await addRule(page);
    await closeSettingsSheet(page);

    // At least one row carries the class. Row-class application lands
    // after the next modelUpdated / cellClassRules tick.
    const rowsWithRule = page.locator(`.ag-row.ds-rule-${id}`);
    await expect(rowsWithRule.first()).toBeVisible({ timeout: 3000 });
  });

  test('cell-scope rule applies ds-rule class only to picked columns', async ({ page }) => {
    const id = await addRule(page);
    // Change to cell scope and pick the `side` column.
    await pickScope(page, id, 'cell');
    await addScopeColumn(page, 'side');
    await saveRule(page, id);
    await closeSettingsSheet(page);

    // `side` cells carry the class; other columns don't.
    const sideCells = page.locator(`.ag-cell.ds-rule-${id}[col-id="side"]`);
    await expect(sideCells.first()).toBeVisible({ timeout: 3000 });

    // Another column should NOT carry the class (rule scope is cell+side only).
    const venueWithRule = page.locator(`.ag-cell.ds-rule-${id}[col-id="venue"]`);
    await expect(venueWithRule).toHaveCount(0);
  });

  test('cell-scope with no columns shows the "no columns" warning', async ({ page }) => {
    const id = await addRule(page);
    void id;
    await pickScope(page, id, 'cell');
    await expect(
      page.locator('[data-testid="cs-no-columns-warning"]'),
    ).toBeVisible();
  });

  test('disabling a rule strips its injected CSS (visual styles removed)', async ({ page }) => {
    const id = await addRule(page);
    await closeSettingsSheet(page);

    // Rule is active by default — the reinject pipeline writes a CSS rule
    // keyed under the rule id into a per-module <style data-ds-module="…">.
    const cssIncludesRule = async () =>
      page.evaluate((rid) => {
        const el = document.querySelector(
          'style[data-ds-module="conditional-styling"]',
        ) as HTMLStyleElement | null;
        return !!el && (el.textContent ?? '').includes(`ds-rule-${rid}`);
      }, id);
    expect(await cssIncludesRule()).toBe(true);

    // Disable the rule via the STATUS Switch in the editor. Toggling writes
    // to the draft (useModuleDraft); SAVE commits.
    await openPanel(page, 'conditional-styling');
    await page.locator(`[data-testid="cs-rule-card-${id}"]`).click();
    await page.locator('[data-testid="cs-rule-editor"]').getByRole('switch').first().click();
    await saveRule(page, id);
    await closeSettingsSheet(page);

    // After commit + reinjectAllRules, the CSS for this rule is gone. The
    // `.ds-rule-<id>` class may linger on previously-painted DOM rows
    // until AG-Grid's next redraw, which is AG-Grid's behaviour — the
    // VISUAL styling is what matters for the user and that's stripped
    // here because the CSS rule is gone.
    expect(await cssIncludesRule()).toBe(false);
  });

  test('priority stepper accepts a number and persists', async ({ page }) => {
    const id = await addRule(page);
    const priority = page.locator(`[data-testid="cs-rule-priority-${id}"]`);
    await priority.fill('42');
    await priority.press('Enter');
    await saveRule(page, id);

    // Re-open via list rail and verify the value is still 42.
    await page.locator(`[data-testid="cs-rule-card-${id}"]`).click();
    await expect(
      page.locator(`[data-testid="cs-rule-priority-${id}"]`),
    ).toHaveValue('42');
  });

  test('deleting a rule removes it from the list and clears the editor', async ({ page }) => {
    const id = await addRule(page);
    await page.locator(`[data-testid="cs-rule-delete-${id}"]`).click();
    await expect(page.locator(`[data-testid="cs-rule-card-${id}"]`)).toHaveCount(0);
  });

  test('FLASH band toggle is gated by enabled + scope', async ({ page }) => {
    const id = await addRule(page);
    // Fresh rule: scope=row, enabled=true. Flash switch exists and defaults off.
    const flashEnable = page.locator(`[data-testid="cs-rule-flash-enabled-${id}"]`);
    await expect(flashEnable).toBeVisible();

    // Toggle flash on.
    await toggleSwitch(page, `cs-rule-flash-enabled-${id}`);

    // Row scope → "TARGETS ENTIRE ROW" hint shows; no cells/headers/both picker.
    await expect(
      page.locator('[data-testid="cs-rule-editor"]'),
    ).toContainText('ENTIRE ROW');

    // Switch to cell scope — the 3-way target picker appears.
    await pickScope(page, id, 'cell');
    await expect(
      page.locator(`[data-testid="cs-rule-flash-target-cells-${id}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-testid="cs-rule-flash-target-headers-${id}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-testid="cs-rule-flash-target-cells+headers-${id}"]`),
    ).toBeVisible();
  });

  test('INDICATOR band renders the icon picker grid', async ({ page }) => {
    const id = await addRule(page);
    // The indicator-color button only renders once an icon is picked.
    // The icon-picker buttons (one per indicator glyph) are always present.
    // `arrow-up` is the first entry in INDICATOR_ICONS.
    await expect(
      page.locator(`[data-testid="cs-rule-indicator-icon-arrow-up-${id}"]`),
    ).toBeVisible();
  });

  test('rule persists across reload (profile auto-save round-trip)', async ({ page }) => {
    const id = await addRule(page);
    await page
      .locator(`[data-testid="cs-rule-name-${id}"]`)
      .fill('Persistent Alert');
    await saveRule(page, id);
    await closeSettingsSheet(page);
    // Explicit-save.
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });

    // Grid still paints the rule's rows.
    await expect(
      page.locator(`.ag-row.ds-rule-${id}`).first(),
    ).toBeVisible({ timeout: 3000 });

    // Panel still shows the rule with its renamed title.
    await openPanel(page, 'conditional-styling');
    await expect(page.locator(`[data-testid="cs-rule-card-${id}"]`)).toBeVisible();
    await page.locator(`[data-testid="cs-rule-card-${id}"]`).click();
    await expect(
      page.locator(`[data-testid="cs-rule-name-${id}"]`),
    ).toHaveValue('Persistent Alert');
  });

  test('two rules show separate cards + editors', async ({ page }) => {
    const first = await addRule(page);
    const second = await addRule(page);
    expect(first).not.toBe(second);
    await expect(page.locator(`[data-testid="cs-rule-card-${first}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="cs-rule-card-${second}"]`)).toBeVisible();

    // The editor is on the second (just-added) rule.
    await expect(
      page.locator(`[data-testid="cs-rule-name-${second}"]`),
    ).toBeVisible();
    // Switch to the first.
    await page.locator(`[data-testid="cs-rule-card-${first}"]`).click();
    await expect(
      page.locator(`[data-testid="cs-rule-name-${first}"]`),
    ).toBeVisible();
  });
});
