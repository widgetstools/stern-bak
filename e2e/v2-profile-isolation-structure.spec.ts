import { test, expect, type Page } from '@playwright/test';
import { bootCleanDemo, openPanel, closeSettingsSheet } from './helpers/settingsSheet';
import { pickSelectOption } from './helpers/shadcnSelect';
import {
  createProfile,
  cloneProfile,
  switchToProfile,
  saveAll,
  readProfileModuleState,
  readStoredProfiles,
  calculatedColumnHeaderVisible,
  columnGroupHeaderVisible,
} from './helpers/profileHelpers';

/**
 * E2E — profile ISOLATION for structure modules (column groups +
 * calculated columns).
 *
 * Same philosophy as the styling spec — UI interaction + disk +
 * grid-DOM assertions, each test proves a structural edit in profile
 * A does not appear in profile B. Clones start as a faithful copy
 * and diverge on edit.
 */

// ─── Column-groups helpers ─────────────────────────────────────────

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

async function saveGroup(page: Page, groupId: string): Promise<void> {
  const btn = page.locator(`[data-testid="cg-save-${groupId}"]`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

async function createGroupWithColumns(page: Page, name: string, colIds: string[]): Promise<string> {
  const id = await createGroup(page);
  await page.locator(`[data-testid="cg-name-${id}"]`).fill(name);
  for (const colId of colIds) {
    await pickSelectOption(page, `cg-add-col-${id}`, colId);
  }
  await saveGroup(page, id);
  return id;
}

// ─── Calculated-columns helpers ────────────────────────────────────

async function listVirtualIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="cc-virtual-"]').evaluateAll((els) =>
    els
      .map((e) => e.getAttribute('data-testid') ?? '')
      .filter((t) => /^cc-virtual-[^-]+$/.test(t))
      .map((t) => t.replace('cc-virtual-', '')),
  );
}

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
  return newId;
}

async function saveVirtual(page: Page, colId: string): Promise<void> {
  const btn = page.locator(`[data-testid="cc-virtual-save-${colId}"]`);
  // Idempotent: freshly-added virtual is already committed (save disabled).
  if (await btn.isDisabled()) return;
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

// ─── Tests ─────────────────────────────────────────────────────────

test.describe('v2 profile isolation — column groups', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('group created in A does not render a group header in B', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const gid = await createGroupWithColumns(page, 'Pricing', ['price', 'yield']);
    await closeSettingsSheet(page);
    await saveAll(page);

    expect(await columnGroupHeaderVisible(page, gid)).toBe(true);

    await createProfile(page, 'Beta');
    expect(await columnGroupHeaderVisible(page, gid)).toBe(false);
  });

  test('group state stored ONLY under the creating profile (disk check)', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const gid = await createGroupWithColumns(page, 'AlphaGroup', ['price']);
    await saveAll(page);

    type GState = { groups?: Array<{ groupId?: string }> };
    const alphaState = await readProfileModuleState<GState>(page, 'alpha', 'column-groups');
    const defaultState = await readProfileModuleState<GState>(page, '__default__', 'column-groups');
    const hasIn = (s: GState | undefined, id: string) =>
      !!s?.groups?.some((n) => n.groupId === id);
    expect(hasIn(alphaState, gid)).toBe(true);
    expect(hasIn(defaultState, gid)).toBe(false);
  });

  test('clone inherits column groups, edits to clone diverge from source', async ({ page }) => {
    await createProfile(page, 'Origin');
    const gid = await createGroupWithColumns(page, 'Original', ['price']);
    await saveAll(page);

    await cloneProfile(page, 'origin', 'Origin');

    // Rename the group in the clone.
    await openPanel(page, 'column-groups');
    await page.locator(`[data-testid="cg-group-${gid}"]`).click();
    await page.locator(`[data-testid="cg-name-${gid}"]`).fill('CloneEdit');
    await saveGroup(page, gid);
    await saveAll(page);

    // Back to Origin — original name preserved.
    await switchToProfile(page, 'origin', 'Origin');
    await openPanel(page, 'column-groups');
    await page.locator(`[data-testid="cg-group-${gid}"]`).click();
    await expect(page.locator(`[data-testid="cg-name-${gid}"]`)).toHaveValue('Original');
  });

  test('two profiles can each carry distinct groups without cross-contamination', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const alphaGid = await createGroupWithColumns(page, 'APricing', ['price']);
    await closeSettingsSheet(page);
    await saveAll(page);

    await createProfile(page, 'Beta');
    const betaGid = await createGroupWithColumns(page, 'BMarkers', ['yield']);
    await closeSettingsSheet(page);
    await saveAll(page);

    // On Beta: beta group visible, alpha group NOT visible.
    expect(await columnGroupHeaderVisible(page, betaGid)).toBe(true);
    expect(await columnGroupHeaderVisible(page, alphaGid)).toBe(false);

    // Flip to Alpha.
    await switchToProfile(page, 'alpha', 'Alpha');
    expect(await columnGroupHeaderVisible(page, alphaGid)).toBe(true);
    expect(await columnGroupHeaderVisible(page, betaGid)).toBe(false);
  });

  test('group deletion in A leaves B unaffected', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const gid = await createGroupWithColumns(page, 'Delete-Me', ['price']);
    await saveAll(page);

    await cloneProfile(page, 'alpha', 'Alpha');
    // On the clone, delete the group.
    await openPanel(page, 'column-groups');
    await page.locator(`[data-testid="cg-group-${gid}"]`).click();
    await page.locator(`[data-testid="cg-delete-${gid}"]`).click();
    // AlertDialog confirm if any.
    const confirm = page.locator('[role="alertdialog"] button').filter({ hasText: /delete|remove|yes/i });
    if (await confirm.count() > 0) await confirm.first().click();
    await saveAll(page);
    await closeSettingsSheet(page);

    expect(await columnGroupHeaderVisible(page, gid)).toBe(false);

    // Back to Alpha — group still there.
    await switchToProfile(page, 'alpha', 'Alpha');
    await closeSettingsSheet(page);
    expect(await columnGroupHeaderVisible(page, gid)).toBe(true);
  });

  test('group persists through reload and remains profile-scoped', async ({ page }) => {
    await createProfile(page, 'Persistent');
    const gid = await createGroupWithColumns(page, 'StickyGroup', ['price', 'yield']);
    await saveAll(page);
    await closeSettingsSheet(page);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    expect(await columnGroupHeaderVisible(page, gid)).toBe(true);
  });

  test('Default profile column groups are separate from user profile groups', async ({ page }) => {
    const defGid = await createGroupWithColumns(page, 'DefaultGroup', ['price']);
    await saveAll(page);

    await createProfile(page, 'Fresh');
    expect(await columnGroupHeaderVisible(page, defGid)).toBe(false);
    // `Fresh` gets auto-dirtied by the grid-state module when AG-Grid
    // sees the column-state change from Default's groups to an empty
    // tree. Commit that transition so the next switch doesn't trip
    // the unsaved-changes AlertDialog.
    await saveAll(page);

    await switchToProfile(page, '__default__', 'Default');
    expect(await columnGroupHeaderVisible(page, defGid)).toBe(true);
  });

  test('multiple groups on one profile all render; none bleed to another', async ({ page }) => {
    await createProfile(page, 'Multi');
    const g1 = await createGroupWithColumns(page, 'G1', ['price']);
    const g2 = await createGroupWithColumns(page, 'G2', ['yield']);
    const g3 = await createGroupWithColumns(page, 'G3', ['spread']);
    await saveAll(page);
    await closeSettingsSheet(page);

    for (const id of [g1, g2, g3]) expect(await columnGroupHeaderVisible(page, id)).toBe(true);

    await createProfile(page, 'Clean');
    for (const id of [g1, g2, g3]) expect(await columnGroupHeaderVisible(page, id)).toBe(false);
  });
});

/**
 * NOTE on calculated-columns DOM assertions:
 * Newly-added virtual columns are registered with AG-Grid (they
 * appear in the filter tool panel + the settings-panel rail) but the
 * MAIN grid header only reflects them after an explicit column-state
 * nudge. This is documented in v2-calculated-columns.spec.ts as a
 * "deferred" interaction with the grid-state module. Profile isolation
 * tests below therefore assert on the MODULE STATE on disk (the
 * primary source of truth) rather than main-header DOM presence.
 */
type VState = { virtualColumns?: Array<{ colId?: string }> };

test.describe('v2 profile isolation — calculated columns', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('virtual column created in A is stored ONLY in A, not in a sibling profile', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const vid = await addVirtualColumn(page);
    await saveVirtual(page, vid);
    await saveAll(page);

    const alphaCc = await readProfileModuleState<VState>(page, 'alpha', 'calculated-columns');
    expect(alphaCc?.virtualColumns?.some((v) => v.colId === vid)).toBe(true);

    await createProfile(page, 'Beta');
    const betaCc = await readProfileModuleState<VState>(page, 'beta', 'calculated-columns');
    expect(betaCc?.virtualColumns?.some((v) => v.colId === vid) ?? false).toBe(false);
  });

  test('virtual column absent from Default profile state after creating under user profile', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const vid = await addVirtualColumn(page);
    await saveVirtual(page, vid);
    await saveAll(page);

    const alphaState = await readProfileModuleState<VState>(page, 'alpha', 'calculated-columns');
    const defaultState = await readProfileModuleState<VState>(page, '__default__', 'calculated-columns');
    const hasCol = (s: VState | undefined, id: string) =>
      !!s?.virtualColumns?.some((v) => v.colId === id);
    expect(hasCol(alphaState, vid)).toBe(true);
    expect(hasCol(defaultState, vid)).toBe(false);
  });

  test('clone preserves virtual columns; editing the clone does not mutate source', async ({ page }) => {
    await createProfile(page, 'Origin');
    const vid = await addVirtualColumn(page);
    await saveVirtual(page, vid);
    await saveAll(page);

    await cloneProfile(page, 'origin', 'Origin');
    const cloneState = await readProfileModuleState<VState>(page, 'origin-copy', 'calculated-columns');
    expect(cloneState?.virtualColumns?.some((v) => v.colId === vid)).toBe(true);

    // Origin state snapshot before the clone's edit.
    const before = await readProfileModuleState<VState>(page, 'origin', 'calculated-columns');
    const beforeCount = before?.virtualColumns?.length ?? 0;

    // Add an additional virtual column ONLY to the clone.
    const vid2 = await addVirtualColumn(page);
    await saveVirtual(page, vid2);
    await saveAll(page);

    // Origin must still have exactly the same number of virtuals as before.
    const after = await readProfileModuleState<VState>(page, 'origin', 'calculated-columns');
    expect(after?.virtualColumns?.length).toBe(beforeCount);
    expect(after?.virtualColumns?.some((v) => v.colId === vid2) ?? false).toBe(false);
  });

  test('deleting a virtual column in clone does not remove it from source', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const vid = await addVirtualColumn(page);
    await saveVirtual(page, vid);
    await saveAll(page);

    await cloneProfile(page, 'alpha', 'Alpha');

    // Delete on the clone.
    await openPanel(page, 'calculated-columns');
    await page.locator(`[data-testid="cc-virtual-${vid}"]`).click();
    await page.locator(`[data-testid="cc-virtual-delete-${vid}"]`).click();
    const confirm = page.locator('[role="alertdialog"] button').filter({ hasText: /delete|remove|yes/i });
    if (await confirm.count() > 0) await confirm.first().click();
    await saveAll(page);

    const cloneState = await readProfileModuleState<VState>(page, 'alpha-copy', 'calculated-columns');
    expect(cloneState?.virtualColumns?.some((v) => v.colId === vid) ?? false).toBe(false);

    const alphaState = await readProfileModuleState<VState>(page, 'alpha', 'calculated-columns');
    expect(alphaState?.virtualColumns?.some((v) => v.colId === vid)).toBe(true);
  });

  test('two profiles with distinct virtual columns — each state contains only its own', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const vidA = await addVirtualColumn(page);
    await saveVirtual(page, vidA);
    await saveAll(page);

    await createProfile(page, 'Beta');
    const vidB = await addVirtualColumn(page);
    await saveVirtual(page, vidB);
    await saveAll(page);

    const alphaState = await readProfileModuleState<VState>(page, 'alpha', 'calculated-columns');
    const betaState = await readProfileModuleState<VState>(page, 'beta', 'calculated-columns');

    expect(alphaState?.virtualColumns?.some((v) => v.colId === vidA)).toBe(true);
    if (vidA !== vidB) {
      expect(alphaState?.virtualColumns?.some((v) => v.colId === vidB) ?? false).toBe(false);
    }
    expect(betaState?.virtualColumns?.some((v) => v.colId === vidB)).toBe(true);
    if (vidA !== vidB) {
      expect(betaState?.virtualColumns?.some((v) => v.colId === vidA) ?? false).toBe(false);
    }
  });

  test('virtual column persists through reload (module state restored)', async ({ page }) => {
    await createProfile(page, 'Persistent');
    const vid = await addVirtualColumn(page);
    await saveVirtual(page, vid);
    await saveAll(page);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    const state = await readProfileModuleState<VState>(page, 'persistent', 'calculated-columns');
    expect(state?.virtualColumns?.some((v) => v.colId === vid)).toBe(true);
  });

  test('N virtual columns on one profile are all stored; none leak to another', async ({ page }) => {
    await createProfile(page, 'MultiVirtual');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await addVirtualColumn(page);
      await saveVirtual(page, id);
      ids.push(id);
    }
    await saveAll(page);

    const multiState = await readProfileModuleState<VState>(page, 'multivirtual', 'calculated-columns');
    for (const id of ids) {
      expect(multiState?.virtualColumns?.some((v) => v.colId === id)).toBe(true);
    }

    await createProfile(page, 'Clean');
    const cleanState = await readProfileModuleState<VState>(page, 'clean', 'calculated-columns');
    for (const id of ids) {
      expect(cleanState?.virtualColumns?.some((v) => v.colId === id) ?? false).toBe(false);
    }
  });
});

test.describe('v2 profile isolation — groups + virtuals combined', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('profile with both groups and virtuals stores both; sibling profile stores neither', async ({ page }) => {
    await createProfile(page, 'Rich');
    const gid = await createGroupWithColumns(page, 'RichGroup', ['price']);
    const vid = await addVirtualColumn(page);
    await saveVirtual(page, vid);
    await saveAll(page);

    // Group header is reliably visible on the active profile (groups
    // render without a column-state nudge); virtual columns need the
    // nudge, so we only disk-assert those.
    expect(await columnGroupHeaderVisible(page, gid)).toBe(true);
    const richVc = await readProfileModuleState<VState>(page, 'rich', 'calculated-columns');
    expect(richVc?.virtualColumns?.some((v) => v.colId === vid)).toBe(true);

    await createProfile(page, 'Empty');
    expect(await columnGroupHeaderVisible(page, gid)).toBe(false);
    const emptyVc = await readProfileModuleState<VState>(page, 'empty', 'calculated-columns');
    expect(emptyVc?.virtualColumns?.some((v) => v.colId === vid) ?? false).toBe(false);
  });

  test('stored profiles table reflects module independence for structure modules', async ({ page }) => {
    await createProfile(page, 'Alpha');
    const gid = await createGroupWithColumns(page, 'AlphaGroup', ['price']);
    await saveAll(page);

    await createProfile(page, 'Beta');
    const vid = await addVirtualColumn(page);
    await saveVirtual(page, vid);
    await saveAll(page);

    const stored = await readStoredProfiles(page);
    const alpha = stored.find((p) => p.id === 'alpha');
    const beta = stored.find((p) => p.id === 'beta');

    const alphaGroups = (alpha!.state['column-groups'] as { v?: number; data?: { groups?: Array<{ groupId?: string }> } }).data;
    const betaGroups = (beta!.state['column-groups'] as { v?: number; data?: { groups?: Array<{ groupId?: string }> } }).data;
    expect(alphaGroups?.groups?.some((n) => n.groupId === gid)).toBe(true);
    expect(betaGroups?.groups?.some((n) => n.groupId === gid) ?? false).toBe(false);

    const alphaVirtuals = (alpha!.state['calculated-columns'] as { v?: number; data?: { virtualColumns?: Array<{ colId?: string }> } }).data;
    const betaVirtuals = (beta!.state['calculated-columns'] as { v?: number; data?: { virtualColumns?: Array<{ colId?: string }> } }).data;
    expect(alphaVirtuals?.virtualColumns?.some((v) => v.colId === vid) ?? false).toBe(false);
    expect(betaVirtuals?.virtualColumns?.some((v) => v.colId === vid)).toBe(true);
  });
});
