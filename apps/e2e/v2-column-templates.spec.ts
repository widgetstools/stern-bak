import { test, expect, type Page } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';
import {
  bootCleanDemo,
  openPanel,
  closeSettingsSheet,
} from './helpers/settingsSheet';

/**
 * Full behavioural coverage for column-templates — the INDIRECT editor
 * (documented in IMPLEMENTED_FEATURES.md §1.8c).
 *
 * Column-templates has NO dedicated settings panel. Templates are
 * authored through three surfaces:
 *
 *   1. SAVE-AS-TEMPLATE in FormattingToolbar — `save-tpl-input` +
 *      `save-tpl-btn` inside the Templates popover (`templates-menu-trigger`)
 *   2. APPLY-TEMPLATE in FormattingToolbar — click
 *      `templates-menu-item-<tplId>` to layer a saved template onto
 *      every currently-selected column
 *   3. REMOVE-TEMPLATE in Column Settings panel — TEMPLATES band renders
 *      applied-template chips with per-chip ×
 *      (`cols-<colId>-template-remove-<tplId>`)
 *
 * This spec exercises each surface and verifies the full round-trip
 * (save → apply → remove) against the grid's computed styles.
 */

// ─── Toolbar helpers ────────────────────────────────────────────────────

async function openFormattingToolbar(page: Page): Promise<void> {
  const pinned = page.locator('[data-testid="formatting-toolbar-pinned"]');
  if (!(await pinned.isVisible().catch(() => false))) {
    await openViewMenu(page);
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
  }
  await expect(page.locator('[data-testid="formatting-toolbar"]')).toBeVisible();
}

async function selectCell(
  page: Page,
  colId: string,
  rowIndex = 0,
): Promise<void> {
  await page
    .locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`)
    .click();
  // Let useActiveColumns batch the state update.
  await page.waitForTimeout(250);
}

async function clickToolbarBtn(page: Page, tooltipText: string): Promise<void> {
  const btn = page.getByRole('button', { name: tooltipText });
  await btn.dispatchEvent('mousedown');
  await page.waitForTimeout(150);
}

/** Reads a computed style property off the first cell of a column. */
async function getCellStyle(
  page: Page,
  colId: string,
  prop: string,
  rowIndex = 0,
): Promise<string> {
  return page.evaluate(
    ({ id, row, p }) => {
      const cell = document.querySelector(
        `.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`,
      );
      return cell ? getComputedStyle(cell).getPropertyValue(p) : '';
    },
    { id: colId, row: rowIndex, p: prop },
  );
}

/** Snapshots the set of existing template-menu item ids by opening the
 *  "Apply a saved template" popover. Closes the popover before returning. */
async function listTemplateIds(page: Page): Promise<string[]> {
  await page.locator('[data-testid="templates-menu-trigger"]').click();
  const ids = await page
    .locator('[data-testid^="templates-menu-item-"]')
    .evaluateAll((els) =>
      els
        .map((e) => e.getAttribute('data-testid') ?? '')
        .map((t) => t.replace('templates-menu-item-', '')),
    );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return ids;
}

/** Opens the "Save as template" popover (separate from "Apply a saved
 *  template"), types a name, clicks Save Template, then returns the
 *  newly-created template id by diffing the Apply popover's item set. */
async function saveAsTemplate(page: Page, name: string): Promise<string> {
  const before = new Set(await listTemplateIds(page));

  // The Save-as-template popover is opened by a distinct TBtn with
  // tooltip text "Save as template" (aria-label = tooltip).
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.locator('[data-testid="save-tpl-input"]')).toBeVisible();
  await page.locator('[data-testid="save-tpl-input"]').fill(name);
  await page.locator('[data-testid="save-tpl-btn"]').click();
  // Popover stays open after save; close it.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  const after = await listTemplateIds(page);
  const newId = after.find((id) => !before.has(id));
  if (!newId) throw new Error('No new template id detected after save');
  return newId;
}

async function applyTemplate(page: Page, tplId: string): Promise<void> {
  // Defensive: ensure no popover is mid-animation from a prior step.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.locator('[data-testid="templates-menu-trigger"]').click();
  const item = page.locator(`[data-testid="templates-menu-item-${tplId}"]`);
  await expect(item).toBeVisible();
  await item.click();
  // Clicking an item closes the popover. Give React a moment to settle
  // before the caller fires the next step (may try to re-open).
  await page.waitForTimeout(300);
}

// ─── Tests ──────────────────────────────────────────────────────────────

test.describe('v2 — column-templates (indirect editor)', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
    await openFormattingToolbar(page);
  });

  test('templates menu shows "no templates yet" copy on a fresh profile', async ({ page }) => {
    await selectCell(page, 'quantity');
    // Open the "Apply a saved template" popover — the item list.
    await page.locator('[data-testid="templates-menu-trigger"]').click();
    await expect(
      page.locator('[data-testid^="templates-menu-item-"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-testid="templates-menu"]')).toContainText(
      'No templates yet',
    );
    await page.keyboard.press('Escape');

    // Open the "Save as template" popover — the input + button.
    await page.getByRole('button', { name: 'Save as template' }).click();
    await expect(page.locator('[data-testid="save-tpl-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="save-tpl-btn"]')).toBeVisible();
  });

  test('save-as-template captures a column\'s styles into a new template', async ({ page }) => {
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Bold');
    // Bold applied to `quantity` — now save as template.
    const tplId = await saveAsTemplate(page, 'Bold Trader');
    expect(tplId).toMatch(/^tpl_/);
  });

  test('applying a saved template layers its styles onto another column', async ({ page }) => {
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Bold');
    const tplId = await saveAsTemplate(page, 'Bold Style');

    // Switch to a different column and apply the template.
    await selectCell(page, 'venue');
    // Venue starts unstyled.
    expect(['400', 'normal']).toContain(await getCellStyle(page, 'venue', 'font-weight'));
    await applyTemplate(page, tplId);
    // Venue now inherits the bold from the template.
    expect(['700', 'bold']).toContain(await getCellStyle(page, 'venue', 'font-weight'));
  });

  test('applied template shows as a chip in the Column Settings TEMPLATES band', async ({ page }) => {
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Italic');
    const tplId = await saveAsTemplate(page, 'Italic Only');

    await selectCell(page, 'spread');
    await applyTemplate(page, tplId);

    // Open Column Settings → spread. The TEMPLATES band shows the applied chip.
    await openPanel(page, 'column-customization');
    await page.locator('[data-testid="cols-item-spread"]').click();
    await expect(
      page.locator(`[data-testid="cols-spread-template-${tplId}"]`),
    ).toBeVisible();
  });

  test('removing a template chip via Column Settings strips the template style', async ({ page }) => {
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Bold');
    const tplId = await saveAsTemplate(page, 'Removable Style');

    await selectCell(page, 'venue');
    await applyTemplate(page, tplId);
    // Confirm bold applied.
    expect(['700', 'bold']).toContain(await getCellStyle(page, 'venue', 'font-weight'));

    // Open Column Settings → venue → remove the template chip.
    await openPanel(page, 'column-customization');
    await page.locator('[data-testid="cols-item-venue"]').click();
    await page
      .locator(`[data-testid="cols-venue-template-remove-${tplId}"]`)
      .click();
    await page.locator('[data-testid="cols-save-venue"]').click();
    await expect(
      page.locator(`[data-testid="cols-save-venue"]`),
    ).toBeDisabled({ timeout: 2000 });
    await closeSettingsSheet(page);

    // Venue cell is no longer bold — the template's styles are gone.
    expect(['400', 'normal']).toContain(await getCellStyle(page, 'venue', 'font-weight'));
  });

  test('saved template persists across reload + reapplies on matching columns', async ({ page }) => {
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Bold');
    const tplId = await saveAsTemplate(page, 'Persistent Style');
    await selectCell(page, 'venue');
    await applyTemplate(page, tplId);

    // Explicit-save: click Save before reload.
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });

    // Venue still bold after reload — both the template definition and
    // its application to venue round-tripped through the profile.
    expect(['700', 'bold']).toContain(await getCellStyle(page, 'venue', 'font-weight'));

    // Templates menu still lists the template.
    await openFormattingToolbar(page);
    await selectCell(page, 'side');
    await page.locator('[data-testid="templates-menu-trigger"]').click();
    await expect(
      page.locator(`[data-testid="templates-menu-item-${tplId}"]`),
    ).toBeVisible();
  });

  test('adding a template via Column Settings picker wires it to the column', async ({ page }) => {
    // First, create a template from the toolbar.
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Italic');
    const tplId = await saveAsTemplate(page, 'Italic Picker Test');

    // Open Column Settings → a DIFFERENT column that hasn't been
    // touched by the toolbar. Use the template-picker Select to add.
    await openPanel(page, 'column-customization');
    await page.locator('[data-testid="cols-item-trader"]').click();
    await page
      .locator('[data-testid="cols-trader-template-picker"]')
      .selectOption(tplId);
    await page.locator('[data-testid="cols-save-trader"]').click();
    await expect(
      page.locator('[data-testid="cols-save-trader"]'),
    ).toBeDisabled({ timeout: 2000 });

    // Chip now shows in the TEMPLATES band.
    await expect(
      page.locator(`[data-testid="cols-trader-template-${tplId}"]`),
    ).toBeVisible();
    await closeSettingsSheet(page);

    // Trader cell now italic.
    expect(await getCellStyle(page, 'trader', 'font-style')).toBe('italic');
  });

  test('toolbar apply-template replaces rather than stacks (single chip)', async ({ page }) => {
    // Behaviour: `applyTemplateToColumnsReducer` sets
    // `templateIds: [templateId]` — replaces any prior templates.
    // Toolbar's "Apply a saved template" is a one-tap swap, not a
    // layer. To stack templates the user goes through the Column
    // Settings template-picker (covered in the separate test below).
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Bold');
    const firstId = await saveAsTemplate(page, 'Bold Tmpl');

    await selectCell(page, 'side');
    await clickToolbarBtn(page, 'Italic');
    const secondId = await saveAsTemplate(page, 'Italic Tmpl');
    expect(firstId).not.toBe(secondId);

    await selectCell(page, 'venue');
    await applyTemplate(page, firstId);
    await applyTemplate(page, secondId);

    // Only the LAST-applied chip is present.
    await openPanel(page, 'column-customization');
    await page.locator('[data-testid="cols-item-venue"]').click();
    await expect(
      page.locator(`[data-testid="cols-venue-template-${firstId}"]`),
    ).toHaveCount(0);
    await expect(
      page.locator(`[data-testid="cols-venue-template-${secondId}"]`),
    ).toBeVisible();
  });

  test('Column Settings template-picker STACKS a second template alongside', async ({ page }) => {
    // Template 1 — bold.
    await selectCell(page, 'quantity');
    await clickToolbarBtn(page, 'Bold');
    const boldId = await saveAsTemplate(page, 'Bold');
    // Template 2 — italic.
    await selectCell(page, 'side');
    await clickToolbarBtn(page, 'Italic');
    const italicId = await saveAsTemplate(page, 'Italic');

    // Apply first via toolbar (replace semantic).
    await selectCell(page, 'venue');
    await applyTemplate(page, boldId);

    // Use Column Settings template-picker to STACK the second (append
    // semantic — the picker appends rather than replacing).
    await openPanel(page, 'column-customization');
    await page.locator('[data-testid="cols-item-venue"]').click();
    await page
      .locator('[data-testid="cols-venue-template-picker"]')
      .selectOption(italicId);
    await page.locator('[data-testid="cols-save-venue"]').click();
    await expect(
      page.locator('[data-testid="cols-save-venue"]'),
    ).toBeDisabled({ timeout: 2000 });

    // Both chips now present.
    await expect(
      page.locator(`[data-testid="cols-venue-template-${boldId}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-testid="cols-venue-template-${italicId}"]`),
    ).toBeVisible();
  });
});
