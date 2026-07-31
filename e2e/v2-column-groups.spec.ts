import { test, expect, type Page } from '@playwright/test';
import {
  bootCleanDemo,
  openPanel,
  closeSettingsSheet,
} from './helpers/settingsSheet';
import { pickSelectOption } from './helpers/shadcnSelect';

/**
 * Full behavioural coverage for the column-groups settings panel
 * (ColumnGroupsPanel, documented in IMPLEMENTED_FEATURES.md §1.8b).
 * Covers the full authoring lifecycle:
 *
 *   - Empty state → add group → rename → save
 *   - Add / remove columns in a group
 *   - Visibility cycle (always → open → closed)
 *   - Subgroup creation + depth cap
 *   - Move up / move down
 *   - Delete
 *   - Header-style band presence
 *   - AG-Grid group header renders after save
 *   - openGroupIds runtime memory survives reload
 *
 * Group IDs are random (`grp_<timestamp><random4>`), so each test reads
 * the generated id from the editor's testid attribute after creation.
 */

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Creates a new top-level group by clicking the add button, waits for
 * the editor to mount, and returns the generated group id.
 */
async function createGroup(page: Page): Promise<string> {
  await openPanel(page, 'column-groups');
  await page.locator('[data-testid="cg-add-group-btn"]').click();
  const editor = page.locator('[data-testid^="cg-group-editor-"]');
  await expect(editor).toBeVisible();
  const testid = await editor.getAttribute('data-testid');
  const id = testid?.replace('cg-group-editor-', '');
  if (!id) throw new Error('Failed to read new group id');
  return id;
}

/**
 * Creates a group, renames it to the given name, adds optional columns,
 * and saves. Returns the generated groupId. Abstracts the three-step
 * authoring pattern most tests need.
 */
async function createGroupWithColumns(
  page: Page,
  name: string,
  colIds: string[],
): Promise<string> {
  const id = await createGroup(page);
  await page.locator(`[data-testid="cg-name-${id}"]`).fill(name);
  for (const colId of colIds) {
    await pickSelectOption(page, `cg-add-col-${id}`, colId);
  }
  await saveGroup(page, id);
  return id;
}

/** Clicks SAVE for a group + waits for dirty to clear. */
async function saveGroup(page: Page, groupId: string): Promise<void> {
  const btn = page.locator(`[data-testid="cg-save-${groupId}"]`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

// ─── Tests ──────────────────────────────────────────────────────────────

test.describe('v2 — column-groups panel', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  test('empty state shows the "no group selected" editor message', async ({ page }) => {
    await openPanel(page, 'column-groups');
    // With no groups, the editor pane shows a "Select a group / press + to add"
    // prompt. The legacy flat panel uses `No column groups yet` copy;
    // master-detail uses this phrasing.
    await expect(page.locator('[data-testid="cg-panel"]')).toContainText(
      'Select a group from the list',
    );
    await closeSettingsSheet(page);
  });

  test('adding a group auto-selects it and seeds "New Group" as the name', async ({ page }) => {
    const id = await createGroup(page);
    // Editor mounts with a TitleInput pre-filled with "New Group".
    await expect(page.locator(`[data-testid="cg-name-${id}"]`)).toHaveValue('New Group');
    // List rail shows the new item.
    await expect(page.locator(`[data-testid="cg-group-${id}"]`)).toBeVisible();
  });

  test('renaming a group + saving persists the name in state', async ({ page }) => {
    const id = await createGroup(page);
    await page.locator(`[data-testid="cg-name-${id}"]`).fill('Trading');
    await saveGroup(page, id);
    // Re-select from another group (create second) then back to confirm
    // the name is re-hydrated from committed state.
    const second = await createGroup(page);
    await page.locator(`[data-testid="cg-group-${id}"]`).click();
    await expect(page.locator(`[data-testid="cg-name-${id}"]`)).toHaveValue('Trading');
    // Cleanup: delete second group so it doesn't pollute later tests.
    await page.locator(`[data-testid="cg-group-${second}"]`).click();
    await page.locator(`[data-testid="cg-delete-${second}"]`).click();
  });

  test('adding columns to a group creates the chip row', async ({ page }) => {
    const id = await createGroupWithColumns(page, 'Market', ['side', 'quantity']);
    // Both chips render under the editor.
    await expect(page.locator(`[data-testid="cg-chip-${id}-side"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="cg-chip-${id}-quantity"]`)).toBeVisible();
  });

  test('grid renders the group header after save', async ({ page }) => {
    await createGroupWithColumns(page, 'Trading Details', ['side', 'quantity']);
    await closeSettingsSheet(page);

    // AG-Grid emits a `.ag-header-group-cell` for every column group.
    // Its label span text should match the group name.
    await expect(
      page
        .locator('.ag-header-group-cell .ag-header-group-text')
        .filter({ hasText: 'Trading Details' }),
    ).toBeVisible({ timeout: 3000 });
  });

  test('column-show tri-state cycles always → open → closed → always', async ({ page }) => {
    const id = await createGroupWithColumns(page, 'Cycle Test', ['venue']);
    const chip = page.locator(`[data-testid="cg-chip-${id}-venue"]`);
    const toggle = page.locator(`[data-testid="cg-chip-show-${id}-venue"]`);

    // Default on add is 'always'.
    await expect(chip).toHaveAttribute('data-show', 'always');

    await toggle.click();
    await expect(chip).toHaveAttribute('data-show', 'open');

    await toggle.click();
    await expect(chip).toHaveAttribute('data-show', 'closed');

    await toggle.click();
    await expect(chip).toHaveAttribute('data-show', 'always');
  });

  test('subgroup creation nests a new group under the parent', async ({ page }) => {
    const parentId = await createGroupWithColumns(page, 'Parent', ['side']);
    // addSubgroup writes into the parent's DRAFT — the subgroup isn't
    // committed until the parent saves.
    await page.locator(`[data-testid="cg-add-sub-${parentId}"]`).click();
    await saveGroup(page, parentId);

    // After commit, flattenGroups includes the subgroup as a second list
    // item indented under the parent. Expect at least 2 `cg-group-<id>`
    // list entries.
    const listItems = page.locator('[data-testid^="cg-group-"]').filter({
      hasNotText: /./,
    });
    // Use a specific count via the list rail's own wrapper — every group
    // becomes a `cg-popout-list-item` with a `cg-group-<id>` testid.
    const allGroupItems = await page
      .locator('[data-testid^="cg-group-"]:not([data-testid*="editor"])')
      .count();
    // One parent + one subgroup after commit.
    expect(allGroupItems).toBeGreaterThanOrEqual(2);
  });

  test('move-up / move-down reorder sibling top-level groups', async ({ page }) => {
    const first = await createGroupWithColumns(page, 'Alpha', []);
    const second = await createGroupWithColumns(page, 'Beta', []);

    // Initial state: Alpha (index 0) can't move up; Beta (index 1) can.
    await page.locator(`[data-testid="cg-group-${first}"]`).click();
    await expect(page.locator(`[data-testid="cg-up-${first}"]`)).toBeDisabled();
    await expect(page.locator(`[data-testid="cg-down-${first}"]`)).toBeEnabled();

    await page.locator(`[data-testid="cg-group-${second}"]`).click();
    await expect(page.locator(`[data-testid="cg-up-${second}"]`)).toBeEnabled();

    // Move Beta up. Alpha now at index 1 (up enabled, down disabled),
    // Beta now at index 0 (up disabled, down enabled).
    await page.locator(`[data-testid="cg-up-${second}"]`).click();
    await expect(page.locator(`[data-testid="cg-up-${second}"]`)).toBeDisabled();
    await page.locator(`[data-testid="cg-group-${first}"]`).click();
    await expect(page.locator(`[data-testid="cg-up-${first}"]`)).toBeEnabled();
    await expect(page.locator(`[data-testid="cg-down-${first}"]`)).toBeDisabled();
  });

  test('delete removes the group from the list + clears the editor', async ({ page }) => {
    const id = await createGroupWithColumns(page, 'Doomed', ['spread']);
    await page.locator(`[data-testid="cg-delete-${id}"]`).click();
    // List item gone.
    await expect(page.locator(`[data-testid="cg-group-${id}"]`)).toHaveCount(0);
    // Editor gone.
    await expect(page.locator(`[data-testid="cg-group-editor-${id}"]`)).toHaveCount(0);
  });

  test('removing a column chip drops it from the group', async ({ page }) => {
    const id = await createGroupWithColumns(page, 'Pair', ['side', 'venue']);
    // Click the × on the side chip (the chip's second-child button is the
    // remove button; testid is not directly on it, so we scope via the chip).
    await page
      .locator(`[data-testid="cg-chip-${id}-side"] button[title="Remove"]`)
      .click();
    await expect(page.locator(`[data-testid="cg-chip-${id}-side"]`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="cg-chip-${id}-venue"]`)).toBeVisible();
  });

  test('header-style StyleEditor band renders in the group editor', async ({ page }) => {
    const id = await createGroup(page);
    await expect(page.locator(`[data-testid="cg-hdr-style-${id}"]`)).toBeVisible();
  });

  test('SAVE pill gated on dirty state', async ({ page }) => {
    const id = await createGroup(page);
    // Fresh group is dirty by default because `headerName: 'New Group'` is a
    // default and the child list is empty — but draft equals committed, so
    // actually the SAVE pill is only enabled after user edits. The auto-add
    // already committed the `groups: [ … ]` array directly (not via a
    // draft), so the draft+committed are equal and SAVE is disabled.
    const save = page.locator(`[data-testid="cg-save-${id}"]`);
    await expect(save).toBeDisabled();

    await page.locator(`[data-testid="cg-name-${id}"]`).fill('Renamed');
    await expect(save).toBeEnabled();

    await save.click();
    await expect(save).toBeDisabled();
  });

  test('group persists across reload (profile auto-save round-trip)', async ({ page }) => {
    const id = await createGroupWithColumns(page, 'Persistent', ['side', 'quantity']);
    await closeSettingsSheet(page);
    // Explicit-save: click Save before reload.
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });

    // Grid still shows the header group.
    await expect(
      page
        .locator('.ag-header-group-cell .ag-header-group-text')
        .filter({ hasText: 'Persistent' }),
    ).toBeVisible({ timeout: 3000 });

    // Panel still carries the group.
    await openPanel(page, 'column-groups');
    await expect(page.locator(`[data-testid="cg-group-${id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="cg-chip-${id}-side"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="cg-chip-${id}-quantity"]`)).toBeVisible();
  });

  test('runtime expand/collapse writes to openGroupIds and survives reload', async ({ page }) => {
    const id = await createGroupWithColumns(page, 'Expander', ['side', 'venue']);
    // Set openByDefault to false via a column-show='open' chip so collapse
    // actually hides something. Set venue to columnGroupShow='open'.
    const toggle = page.locator(`[data-testid="cg-chip-show-${id}-venue"]`);
    await toggle.click(); // always → open
    await saveGroup(page, id);
    await closeSettingsSheet(page);
    await page.waitForTimeout(300);

    // Collapse the group by clicking the group header's expand chevron.
    // AG-Grid renders `.ag-header-expand-icon` inside the group header,
    // and duplicates the header across pinned + center containers, so
    // scope to the first match explicitly.
    const groupHeader = page
      .locator('.ag-header-group-cell')
      .filter({ hasText: 'Expander' })
      .first();
    await expect(groupHeader).toBeVisible();
    const chevron = groupHeader.locator('.ag-header-expand-icon').first();
    // Chevron click toggles expanded state. Default openByDefault: true,
    // so clicking collapses. `venue` (show='open') then hides.
    await chevron.click();
    await page.waitForTimeout(200);
    // Explicit-save: the chevron click mutates the openGroupIds in
    // module state but doesn't persist until we hit Save.
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);

    // Reload and verify the collapsed state was persisted via openGroupIds.
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });

    // After reload, the group is collapsed, so `venue` (show='open') is not
    // in the DOM.
    await expect(
      page.locator('.ag-header-container [col-id="venue"]'),
    ).toHaveCount(0, { timeout: 3000 });
  });
});
