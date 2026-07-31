import { test, expect, type Page } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';
import { bootCleanDemo } from './helpers/settingsSheet';

/**
 * Boot the ConfigService demo (port 5191) from scratch — clears BOTH
 * the seeded `marketsui-config` Dexie DB and the per-user showcase
 * flags in localStorage so the test always starts from a known state.
 */
const CS_DEMO_URL = 'http://localhost:5191/';

async function bootCleanConfigServiceDemo(page: Page): Promise<void> {
  await page.goto(CS_DEMO_URL);
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 15_000 });
  // Nuke the ConfigService Dexie DB + demo's localStorage flags so
  // seed-config.json re-runs and no stale profiles leak in.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('marketsui-config');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('demo-cs-') || k.startsWith('gc-')) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
  });
  await page.goto(CS_DEMO_URL);
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 15_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  // Let ConfigManager.init() + seedIfEmpty() + ensureShowcaseSeedFor
  // all complete before the test starts poking at the grid.
  await page.waitForTimeout(800);
}

/**
 * Create-and-apply template round-trip test.
 *
 * Focused reproduction for the "saved template never shows up" bug:
 * when the user applies formatting to column A, saves it as a named
 * template via the Templates popover, closes, and reopens — did the
 * save actually register in the TemplateManager's Select list? And
 * does applying the saved template to column B carry the formatting
 * across?
 *
 * This test exercises:
 *   1. Select a cell in column `price`
 *   2. Apply BOLD via the formatting toolbar
 *   3. Open the Templates popover (Library module, LayoutTemplate icon
 *      + chevron = testid "templates-menu-trigger")
 *   4. Type a name into `tb-tpl-save-input`
 *   5. Click `tb-tpl-save-btn`
 *   6. Verify: `tb-tpl-select` renders (non-empty state)
 *   7. Verify: `tb-tpl-select` has ≥1 option with the template name
 *   8. Verify: `tb-tpl-select`'s current value maps to that template
 *     (proves save → auto-apply wiring)
 *   9. Verify: column `price` renders bold
 *  10. Close the popover
 *  11. Select a cell in column `quantity`
 *  12. Re-open the popover
 *  13. Pick the saved template from `tb-tpl-select`
 *  14. Verify: column `quantity` renders bold
 *  15. Verify: column `price` STILL renders bold (independent assignment)
 */

// ─── Toolbar + popover helpers ──────────────────────────────────────────

async function openFormattingToolbar(page: Page): Promise<void> {
  const pinned = page.locator('[data-testid="formatting-toolbar"]');
  if (!(await pinned.isVisible().catch(() => false))) {
    await openViewMenu(page);
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
  }
  await expect(page.locator('[data-testid="formatting-toolbar"]')).toBeVisible();
}

async function openTemplatesPopover(page: Page): Promise<void> {
  await page.locator('[data-testid="templates-menu-trigger"]').click();
  await expect(page.locator('[data-testid="templates-menu"]')).toBeVisible();
  // The TemplateManager lives inside the popover; wait for its root
  // so every sub-element query below is bounded.
  await expect(page.locator('[data-testid="tb-tpl-manager"]')).toBeVisible();
}

async function closeTemplatesPopover(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="templates-menu"]')).toHaveCount(0);
}

async function selectCell(page: Page, colId: string, rowIndex = 0): Promise<void> {
  await page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`).click();
  // Let useActiveColumns batch the state update.
  await page.waitForTimeout(250);
}

/** Click a toolbar icon button by its aria-label / tooltip text. Uses
 *  mousedown because the toolbar buttons preventDefault in onMouseDown
 *  to avoid blur-eating the active cell selection. */
async function clickToolbarBtn(page: Page, tooltipText: string): Promise<void> {
  const btn = page.getByRole('button', { name: tooltipText });
  await btn.dispatchEvent('mousedown');
  await page.waitForTimeout(150);
}

async function getCellFontWeight(
  page: Page,
  colId: string,
  rowIndex = 0,
): Promise<string> {
  return page.evaluate(
    ({ id, row }) => {
      const cell = document.querySelector(
        `.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`,
      );
      return cell ? getComputedStyle(cell).getPropertyValue('font-weight') : '';
    },
    { id: colId, row: rowIndex },
  );
}

function isBold(weight: string): boolean {
  // AG-Grid renders "bold" via font-weight: 700 (or "bold" keyword
  // normalized to 700 by the browser). Anything ≥ 600 counts.
  const n = Number(weight);
  return Number.isFinite(n) ? n >= 600 : weight === 'bold' || weight === 'bolder';
}

// ─── Test ──────────────────────────────────────────────────────────────

// Shared scenarios — parameterised over the two demo apps so the
// exact same interaction path is validated on both the plain-Dexie
// backed demo (port 5190) AND the ConfigService-backed demo (port
// 5191). If the "saved template never shows up" bug only manifests
// on the ConfigService path, the 5191 variant will fail while 5190
// passes — which localises the issue to storage-factory wiring.
type DemoVariant = {
  label: string;
  boot: (page: Page) => Promise<void>;
};

const DEMO_VARIANTS: DemoVariant[] = [
  { label: 'demo-react (Dexie direct, :5190)', boot: bootCleanDemo },
  { label: 'demo-configservice-react (ConfigService, :5191)', boot: bootCleanConfigServiceDemo },
];

for (const variant of DEMO_VARIANTS) {
test.describe(`formatter templates — create + apply round-trip — ${variant.label}`, () => {
  test.beforeEach(async ({ page }) => {
    await variant.boot(page);
    await openFormattingToolbar(page);
  });

  test('save-as-template auto-applies, then re-applies to a second column', async ({
    page,
  }) => {
    // ── Step 1: select column `price`, apply bold ───────────────────
    await selectCell(page, 'price');
    const beforeBold = await getCellFontWeight(page, 'price');
    expect(isBold(beforeBold)).toBe(false);

    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(200);

    const afterBold = await getCellFontWeight(page, 'price');
    expect(isBold(afterBold)).toBe(true);

    // ── Step 2: open Templates popover — empty state ────────────────
    await openTemplatesPopover(page);

    // When no templates exist, our refactored TemplateManager:
    //   • hides the Select entirely
    //   • hides the Delete button
    //   • shows an empty-state caption below the input
    await expect(page.locator('[data-testid="tb-tpl-select"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="tb-tpl-delete-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="tb-tpl-empty-hint"]')).toBeVisible();

    // ── Step 3: type a name, click save ─────────────────────────────
    const TEMPLATE_NAME = 'Bold Trader';
    await page.locator('[data-testid="tb-tpl-save-input"]').fill(TEMPLATE_NAME);
    await page.locator('[data-testid="tb-tpl-save-btn"]').click();
    await page.waitForTimeout(300);

    // ── Step 4: populated state — Select + Delete both visible ──────
    await expect(page.locator('[data-testid="tb-tpl-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="tb-tpl-delete-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="tb-tpl-empty-hint"]')).toHaveCount(0);

    // Select should have the new template as an option.
    const optionTexts = await page
      .locator('[data-testid="tb-tpl-select"] option')
      .allTextContents();
    expect(optionTexts).toContain(TEMPLATE_NAME);

    // Select's current value must map to the new template id — proves
    // the save → auto-apply wiring. The user's bug report was that
    // the Select stayed on "Choose a template…" after saving; this
    // assertion catches that regression.
    const currentValue = await page
      .locator('[data-testid="tb-tpl-select"]')
      .inputValue();
    expect(currentValue).not.toBe('');
    expect(currentValue).toMatch(/^tpl_/); // ids are `tpl_<ts>_<suffix>`

    // And the currently-selected option's TEXT should match the template name.
    const currentOptionText = await page
      .locator(`[data-testid="tb-tpl-select"] option[value="${currentValue}"]`)
      .textContent();
    expect(currentOptionText?.trim()).toBe(TEMPLATE_NAME);

    // Input should have been cleared after the save.
    await expect(page.locator('[data-testid="tb-tpl-save-input"]')).toHaveValue('');

    // ── Step 5: close popover ───────────────────────────────────────
    await closeTemplatesPopover(page);

    // `price` stays bold after closing the popover.
    expect(isBold(await getCellFontWeight(page, 'price'))).toBe(true);

    // ── Step 6: select a DIFFERENT column (`quantity`) ──────────────
    await selectCell(page, 'quantity');
    expect(isBold(await getCellFontWeight(page, 'quantity'))).toBe(false);

    // ── Step 7: open popover → apply the saved template ─────────────
    await openTemplatesPopover(page);

    // The Select should still have the template, but the current
    // value should now reflect `quantity`'s assignment — which is
    // empty (no template applied) so the placeholder "" wins.
    await expect(page.locator('[data-testid="tb-tpl-select"]')).toBeVisible();
    const qtyCurrentValue = await page
      .locator('[data-testid="tb-tpl-select"]')
      .inputValue();
    expect(qtyCurrentValue).toBe('');

    // REGRESSION GUARD: the toolbar popover used to call
    // `preventDefault()` on mousedown for non-INPUT elements — which
    // silently killed the native <select>'s dropdown from opening
    // (the dropdown opens on mousedown). Simulate a real user click
    // via dispatching the mousedown that a click would fire and
    // assert it isn't prevented. If a future refactor re-introduces
    // the over-eager preventDefault, this assertion fails loudly.
    const mousedownPrevented = await page
      .locator('[data-testid="tb-tpl-select"]')
      .evaluate((el) => {
        const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        const dispatched = el.dispatchEvent(ev);
        // dispatchEvent returns false if preventDefault was called.
        return !dispatched;
      });
    expect(mousedownPrevented).toBe(false);

    // Apply by selecting the saved template's option.
    await page
      .locator('[data-testid="tb-tpl-select"]')
      .selectOption({ label: TEMPLATE_NAME });
    await page.waitForTimeout(250);

    // ── Step 8: verify `quantity` picked up the bold ────────────────
    expect(isBold(await getCellFontWeight(page, 'quantity'))).toBe(true);

    // And `price` is STILL bold — applying to quantity didn't
    // clobber price's assignment.
    expect(isBold(await getCellFontWeight(page, 'price'))).toBe(true);

    // ── Step 9: Select's current value now reflects quantity's
    //   applied template (same id as before). ─────────────────────────
    const qtyAfter = await page
      .locator('[data-testid="tb-tpl-select"]')
      .inputValue();
    expect(qtyAfter).toBe(currentValue);
  });

  test('save-as-template is a no-op when the active column has no styling', async ({
    page,
  }) => {
    // Safety: snapshotTemplate returns undefined when the active column
    // has no cellStyle / headerStyle / formatter template. Clicking
    // Save in that state should NOT land a template in state — the
    // Select must remain hidden (empty-state invariant).
    await selectCell(page, 'quantity');

    await openTemplatesPopover(page);

    await page.locator('[data-testid="tb-tpl-save-input"]').fill('No-op Attempt');
    await page.locator('[data-testid="tb-tpl-save-btn"]').click();
    await page.waitForTimeout(300);

    // Still empty — no Select, no Delete, empty-hint still visible.
    await expect(page.locator('[data-testid="tb-tpl-select"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="tb-tpl-delete-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="tb-tpl-empty-hint"]')).toBeVisible();

    // And the input KEEPS its text — the onSave callback only clears
    // when saveAsTemplate returns an id (success), so "failed" saves
    // leave the draft for the user to try again.
    await expect(page.locator('[data-testid="tb-tpl-save-input"]')).toHaveValue(
      'No-op Attempt',
    );
  });
});
}
