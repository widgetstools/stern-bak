import { test, expect, type Page } from '@playwright/test';
import {
  bootCleanDemo,
  openPanel,
  closeSettingsSheet,
} from './helpers/settingsSheet';

/**
 * Full behavioural coverage for the calculated-columns settings panel
 * (CalculatedColumnsPanel, documented in IMPLEMENTED_FEATURES.md §1.8).
 *
 * The module ships with zero virtual columns — users add columns through
 * the panel. Tests exercise add / rename / delete / save / persistence.
 *
 * Expression editing uses the ExpressionEditor's commit path. The
 * editor lazy-loads Monaco, so we rely on default expressions for most
 * flows; expression parsing has its own unit tests.
 */

// ─── Helpers ────────────────────────────────────────────────────────────

/** Reads every `cc-virtual-<id>` testid currently in the panel rail. */
async function listVirtualIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="cc-virtual-"]')
    .evaluateAll((els) =>
      els
        .map((e) => e.getAttribute('data-testid') ?? '')
        .filter((t) => /^cc-virtual-[^-]+$/.test(t))
        .map((t) => t.replace('cc-virtual-', '')),
    );
}

/** Creates a fresh virtual column and returns its generated colId. */
async function addVirtualColumn(page: Page): Promise<string> {
  await openPanel(page, 'calculated-columns');
  const before = new Set(await listVirtualIds(page));
  await page.locator('[data-testid="cc-add-virtual-btn"]').click();
  await page.waitForFunction(
    (existing) => {
      const nodes = Array.from(document.querySelectorAll('[data-testid^="cc-virtual-"]'));
      return nodes.some((n) => {
        const t = n.getAttribute('data-testid') ?? '';
        if (!/^cc-virtual-[^-]+$/.test(t)) return false;
        return !(existing as string[]).includes(t.replace('cc-virtual-', ''));
      });
    },
    [...before],
    { timeout: 3000 },
  );
  const after = await listVirtualIds(page);
  const newId = after.find((id) => !before.has(id));
  if (!newId) throw new Error('Failed to identify newly-added virtual colId');
  await expect(page.locator(`[data-testid="cc-virtual-editor-${newId}"]`)).toBeVisible();
  return newId;
}

/** Clicks SAVE and waits for dirty to clear. */
async function saveVirtual(page: Page, colId: string): Promise<void> {
  const btn = page.locator(`[data-testid="cc-virtual-save-${colId}"]`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

// ─── Tests ──────────────────────────────────────────────────────────────

test.describe('v2 — calculated-columns panel', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  test('fresh profile starts with no virtual columns', async ({ page }) => {
    await openPanel(page, 'calculated-columns');
    await expect(page.locator('[data-testid^="cc-virtual-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="cc-add-virtual-btn"]')).toBeVisible();
  });

  test('adding a virtual column creates a new item with default header', async ({ page }) => {
    const id = await addVirtualColumn(page);
    await expect(page.locator(`[data-testid="cc-virtual-${id}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-testid="cc-virtual-header-${id}"]`),
    ).toHaveValue('New Column');
  });

  test('renaming a virtual column persists after save + re-select', async ({ page }) => {
    const id = await addVirtualColumn(page);
    const headerInput = page.locator(`[data-testid="cc-virtual-header-${id}"]`);
    await headerInput.fill('Daily P&L');
    await saveVirtual(page, id);
    await page.locator(`[data-testid="cc-virtual-${id}"]`).click();
    await expect(headerInput).toHaveValue('Daily P&L');
  });

  test('value-formatter picker mounts in the editor', async ({ page }) => {
    const id = await addVirtualColumn(page);
    await expect(
      page.locator(`[data-testid="cc-virtual-fmt-${id}-trigger"]`),
    ).toBeVisible();
  });

  test('changing a new column colId persists in committed state', async ({ page }) => {
    const id = await addVirtualColumn(page);
    await page.locator(`[data-testid="cc-virtual-header-${id}"]`).fill('Pnl');
    const colIdInput = page.locator(`[data-testid="cc-virtual-colid-${id}"]`);
    await colIdInput.fill('pnl_custom');
    await colIdInput.press('Enter');
    await page.locator(`[data-testid="cc-virtual-save-${id}"]`).click();
    await expect(
      page.locator(`[data-testid="cc-virtual-pnl_custom"]`),
    ).toBeVisible();
    await expect(page.locator(`[data-testid="cc-virtual-${id}"]`)).toHaveCount(0);
  });

  test('deleting a user-added column removes it from the panel', async ({ page }) => {
    const id = await addVirtualColumn(page);
    await page.locator(`[data-testid="cc-virtual-header-${id}"]`).fill('Deletable');
    await saveVirtual(page, id);
    await page.locator(`[data-testid="cc-virtual-delete-${id}"]`).click();
    await expect(page.locator(`[data-testid="cc-virtual-${id}"]`)).toHaveCount(0);
    await expect(
      page.locator(`[data-testid="cc-virtual-editor-${id}"]`),
    ).toHaveCount(0);
  });

  test('SAVE pill gated on dirty state', async ({ page }) => {
    const id = await addVirtualColumn(page);
    const save = page.locator(`[data-testid="cc-virtual-save-${id}"]`);
    await expect(save).toBeDisabled();

    await page.locator(`[data-testid="cc-virtual-header-${id}"]`).fill('Dirty');
    await expect(save).toBeEnabled();

    await save.click();
    await expect(save).toBeDisabled();
  });

  test('rename persists across reload', async ({ page }) => {
    const id = await addVirtualColumn(page);
    await page.locator(`[data-testid="cc-virtual-header-${id}"]`).fill('Persistent Name');
    await saveVirtual(page, id);
    await closeSettingsSheet(page);
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });

    await openPanel(page, 'calculated-columns');
    await page.locator(`[data-testid="cc-virtual-${id}"]`).click();
    await expect(
      page.locator(`[data-testid="cc-virtual-header-${id}"]`),
    ).toHaveValue('Persistent Name');
  });

  test('two added virtual columns render as separate list items', async ({ page }) => {
    const first = await addVirtualColumn(page);
    const second = await addVirtualColumn(page);
    expect(first).not.toBe(second);
    await expect(page.locator(`[data-testid="cc-virtual-${first}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="cc-virtual-${second}"]`)).toBeVisible();
  });
});
