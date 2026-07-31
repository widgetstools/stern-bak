import { test, expect, type Page } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';
import { bootCleanDemo, openPanel, closeSettingsSheet } from './helpers/settingsSheet';
import {
  createProfile,
  cloneProfile,
  deleteProfile,
  switchToProfile,
  saveAll,
  readStoredProfiles,
  readActiveProfileId,
  profileTrigger,
  openProfilePopover,
  countRowsWithRuleClass,
  columnGroupHeaderVisible,
  readCellFontWeight,
  readProfileModuleState,
} from './helpers/profileHelpers';

// Virtual columns have a documented column-visibility quirk (see the
// note at the top of v2-profile-isolation-structure.spec.ts): new
// virtuals register with AG-Grid but the main header needs an explicit
// `setColumnVisible` nudge. We assert on module state instead of DOM.
type VState = { virtualColumns?: Array<{ colId?: string }> };

async function profileHasVirtual(page: import('@playwright/test').Page, profileId: string, colId: string): Promise<boolean> {
  const s = await readProfileModuleState<VState>(page, profileId, 'calculated-columns');
  return !!s?.virtualColumns?.some((v) => v.colId === colId);
}

/**
 * E2E — profile STRESS tests.
 *
 * The "happy path" specs above confirm each individual operation
 * works in isolation. This spec hammers the profile system with
 * rapid mixed sequences to catch:
 *   - Race conditions between create + switch + save
 *   - Leaked state from a previous profile into a freshly-created one
 *   - Dirty-flag ambiguity across module boundaries
 *   - Storage integrity (no phantom rows, no missing rows) under
 *     high-frequency mutation
 *   - Reload round-trip for profiles carrying many modules of state
 */

// ─── Helpers ───────────────────────────────────────────────────────

async function openFormatterToolbar(page: Page): Promise<void> {
  const toolbar = page.locator('[data-testid="formatting-toolbar"]');
  if (await toolbar.isVisible().catch(() => false)) return;
  await openViewMenu(page);
  await page.locator('[data-testid="style-toolbar-toggle"]').click();
  await expect(toolbar).toBeVisible();
}

async function clickBoldOn(page: Page, colId: string): Promise<void> {
  await page.locator(`.ag-cell[col-id="${colId}"]`).first().click();
  // Wait for cellFocused → useActiveColumns update.
  await page.waitForTimeout(250);
  const bold = page.locator('[data-testid="formatting-toolbar"] button[aria-label="Bold"]');
  await bold.dispatchEvent('mousedown');
  // Wait for transform + CSS → AG-Grid redraw.
  await page.waitForTimeout(400);
}

async function addConditionalRule(page: Page): Promise<string> {
  await openPanel(page, 'conditional-styling');
  await page.locator('[data-testid="cs-add-rule-btn"]').click();
  const editor = page.locator('[data-testid="cs-rule-editor"]');
  await expect(editor).toBeVisible();
  const attr = await editor.getAttribute('data-rule-testid');
  const id = attr?.replace('cs-rule-editor-', '');
  if (!id) throw new Error('Failed to read new rule id');
  // Freshly-added rules are auto-committed (save disabled); only click
  // when there IS something to save.
  const saveBtn = page.locator(`[data-testid="cs-rule-save-${id}"]`);
  if (!(await saveBtn.isDisabled())) {
    await saveBtn.click();
    await expect(saveBtn).toBeDisabled({ timeout: 2000 });
  }
  return id;
}

async function addGroup(page: Page, name: string, cols: string[]): Promise<string> {
  await openPanel(page, 'column-groups');
  await page.locator('[data-testid="cg-add-group-btn"]').click();
  const editor = page.locator('[data-testid^="cg-group-editor-"]');
  await expect(editor).toBeVisible();
  const id = (await editor.getAttribute('data-testid'))!.replace('cg-group-editor-', '');
  await page.locator(`[data-testid="cg-name-${id}"]`).fill(name);
  for (const col of cols) {
    await page.locator(`[data-testid="cg-add-col-${id}"]`).selectOption(col);
  }
  await page.locator(`[data-testid="cg-save-${id}"]`).click();
  await expect(page.locator(`[data-testid="cg-save-${id}"]`)).toBeDisabled({ timeout: 2000 });
  return id;
}

async function addVirtual(page: Page): Promise<string> {
  await openPanel(page, 'calculated-columns');
  const before = await page.locator('[data-testid^="cc-virtual-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid') ?? '')
      .filter((t) => /^cc-virtual-[^-]+$/.test(t))
      .map((t) => t.replace('cc-virtual-', ''))
  );
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
    before,
    { timeout: 3000 },
  );
  const after = await page.locator('[data-testid^="cc-virtual-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid') ?? '')
      .filter((t) => /^cc-virtual-[^-]+$/.test(t))
      .map((t) => t.replace('cc-virtual-', ''))
  );
  const id = after.find((x) => !before.includes(x))!;
  const saveBtn = page.locator(`[data-testid="cc-virtual-save-${id}"]`);
  // Idempotent — auto-committed rows have a disabled save.
  if (!(await saveBtn.isDisabled())) {
    await saveBtn.click();
    await expect(saveBtn).toBeDisabled({ timeout: 2000 });
  }
  return id;
}

// ─── Tests ─────────────────────────────────────────────────────────

// Stress specs do many rapid CRUD ops per test. The default 30s
// per-test timeout is tight on Windows + single-worker runs where
// the dev server's cold-start `bootCleanDemo` alone can take 5-10s.
// Bump per-test timeout for this whole file so beforeEach + test
// body share a more realistic budget.
test.describe.configure({ timeout: 60_000 });

test.describe('v2 profile stress — rapid CRUD cycles', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('create 10 profiles in sequence — all persist, none duplicate', async ({ page }) => {
    const names = Array.from({ length: 10 }, (_, i) => `Profile-${i + 1}`);
    for (const n of names) await createProfile(page, n);
    const stored = await readStoredProfiles(page);
    const ids = stored.map((p) => p.id).sort();
    expect(ids).toContain('__default__');
    for (let i = 1; i <= 10; i++) {
      expect(ids).toContain(`profile-${i}`);
    }
    expect(stored).toHaveLength(11);
  });

  test('create 5, delete 3, remaining 2 plus Default all intact', async ({ page }) => {
    await createProfile(page, 'A');
    await createProfile(page, 'B');
    await createProfile(page, 'C');
    await createProfile(page, 'D');
    await createProfile(page, 'E');

    await switchToProfile(page, 'a', 'A');
    await deleteProfile(page, 'b');
    await deleteProfile(page, 'd');
    await switchToProfile(page, 'c', 'C');
    await deleteProfile(page, 'e');

    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'a', 'c']);
  });

  test('clone 5 times in rapid succession — each gets a unique "(copy N)" name', async ({ page }) => {
    await createProfile(page, 'Seed');
    for (let i = 0; i < 5; i++) {
      await switchToProfile(page, 'seed', 'Seed');
      await cloneProfile(page, 'seed', 'Seed');
    }
    const stored = await readStoredProfiles(page);
    const cloneNames = stored.filter((p) => p.id.startsWith('seed-copy')).map((p) => p.name).sort();
    expect(cloneNames.length).toBe(5);
    expect(cloneNames).toContain('Seed (copy)');
    expect(cloneNames).toContain('Seed (copy 2)');
    expect(cloneNames).toContain('Seed (copy 3)');
    expect(cloneNames).toContain('Seed (copy 4)');
    expect(cloneNames).toContain('Seed (copy 5)');
  });

  test('interleaved create / clone / delete keeps storage consistent', async ({ page }) => {
    await createProfile(page, 'First');
    await cloneProfile(page, 'first', 'First'); // active: first-copy
    await switchToProfile(page, 'first', 'First');
    await createProfile(page, 'Second');
    await cloneProfile(page, 'second', 'Second'); // active: second-copy
    await switchToProfile(page, 'first-copy', 'First (copy)');
    await deleteProfile(page, 'first');
    await deleteProfile(page, 'second-copy');

    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'first-copy', 'second']);
  });

  test('rapid switch cycles (A→B→C→A→B→…) — active-id always matches the trigger text', async ({ page }) => {
    await createProfile(page, 'A');
    await createProfile(page, 'B');
    await createProfile(page, 'C');
    const order = ['a', 'b', 'c', 'a', 'c', 'b', 'a', 'b', 'c', '__default__', 'a'];
    const display = ['A', 'B', 'C', 'A', 'C', 'B', 'A', 'B', 'C', 'Default', 'A'];
    for (let i = 0; i < order.length; i++) {
      await switchToProfile(page, order[i], display[i]);
      expect(await readActiveProfileId(page)).toBe(order[i]);
      await expect(profileTrigger(page)).toContainText(display[i]);
    }
  });

  test('delete the currently-active profile falls back to Default every time (run 5×)', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      const name = `Temp-${i}`;
      await createProfile(page, name);
      expect(await readActiveProfileId(page)).toBe(`temp-${i}`);
      await deleteProfile(page, `temp-${i}`);
      expect(await readActiveProfileId(page)).toBe('__default__');
    }
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toEqual(['__default__']);
  });
});

test.describe('v2 profile stress — populated profiles', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('populate A with multi-module state, clone to B, both carry all four modules after switch', async ({ page }) => {
    await createProfile(page, 'Alpha');
    await openFormatterToolbar(page);
    await clickBoldOn(page, 'price');
    const rule = await addConditionalRule(page);
    const grp = await addGroup(page, 'AlphaGrp', ['price']);
    const vid = await addVirtual(page);
    await saveAll(page);

    // Clone Alpha → "Alpha (copy)".
    await cloneProfile(page, 'alpha', 'Alpha');

    // Clone should have all four things — DOM for styling/groups,
    // state for virtuals (grid-state nudge exception).
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    expect(await countRowsWithRuleClass(page, rule)).toBeGreaterThan(0);
    expect(await columnGroupHeaderVisible(page, grp)).toBe(true);
    expect(await profileHasVirtual(page, 'alpha-copy', vid)).toBe(true);

    // Back to Alpha — still complete.
    await switchToProfile(page, 'alpha', 'Alpha');
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    expect(await countRowsWithRuleClass(page, rule)).toBeGreaterThan(0);
    expect(await columnGroupHeaderVisible(page, grp)).toBe(true);
    expect(await profileHasVirtual(page, 'alpha', vid)).toBe(true);
  });

  test('populate A, switch to fresh B — all four module surfaces are empty on B', async ({ page }) => {
    await createProfile(page, 'Alpha');
    await openFormatterToolbar(page);
    await clickBoldOn(page, 'yield');
    const rule = await addConditionalRule(page);
    const grp = await addGroup(page, 'AGrp', ['price']);
    const vid = await addVirtual(page);
    await saveAll(page);

    await createProfile(page, 'Beta');

    expect(await readCellFontWeight(page, 'yield')).not.toBe('700');
    expect(await countRowsWithRuleClass(page, rule)).toBe(0);
    expect(await columnGroupHeaderVisible(page, grp)).toBe(false);
    expect(await profileHasVirtual(page, 'beta', vid)).toBe(false);
  });

  test('populate A, reload, profiles + state all restore correctly', async ({ page }) => {
    await createProfile(page, 'Restored');
    await openFormatterToolbar(page);
    await clickBoldOn(page, 'spread');
    const rule = await addConditionalRule(page);
    const grp = await addGroup(page, 'RestoreGrp', ['yield']);
    const vid = await addVirtual(page);
    await saveAll(page);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    await page.waitForTimeout(500);

    await expect(profileTrigger(page)).toContainText('Restored');
    expect(await readCellFontWeight(page, 'spread')).toBe('700');
    expect(await countRowsWithRuleClass(page, rule)).toBeGreaterThan(0);
    expect(await columnGroupHeaderVisible(page, grp)).toBe(true);
    expect(await profileHasVirtual(page, 'restored', vid)).toBe(true);
  });

  test('populate 3 profiles differently; cycle A→B→C and each renders its own state', async ({ page }) => {
    await createProfile(page, 'A');
    await openFormatterToolbar(page);
    await clickBoldOn(page, 'price');
    await saveAll(page);

    await createProfile(page, 'B');
    const ruleB = await addConditionalRule(page);
    await closeSettingsSheet(page);
    await saveAll(page);

    await createProfile(page, 'C');
    const grpC = await addGroup(page, 'CGroup', ['yield']);
    await closeSettingsSheet(page);
    await saveAll(page);

    // On C now: grpC visible, ruleB absent, price not bold.
    expect(await columnGroupHeaderVisible(page, grpC)).toBe(true);
    expect(await countRowsWithRuleClass(page, ruleB)).toBe(0);
    expect(await readCellFontWeight(page, 'price')).not.toBe('700');

    await switchToProfile(page, 'a', 'A');
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    expect(await countRowsWithRuleClass(page, ruleB)).toBe(0);
    expect(await columnGroupHeaderVisible(page, grpC)).toBe(false);

    await switchToProfile(page, 'b', 'B');
    expect(await countRowsWithRuleClass(page, ruleB)).toBeGreaterThan(0);
    expect(await readCellFontWeight(page, 'price')).not.toBe('700');
    expect(await columnGroupHeaderVisible(page, grpC)).toBe(false);
  });

  test('clone → edit clone → original unchanged (full module matrix)', async ({ page }) => {
    await createProfile(page, 'Origin');
    await openFormatterToolbar(page);
    await clickBoldOn(page, 'price');
    const origRule = await addConditionalRule(page);
    await closeSettingsSheet(page);
    await saveAll(page);

    await cloneProfile(page, 'origin', 'Origin');
    // Modify the clone.
    await openFormatterToolbar(page);
    await clickBoldOn(page, 'yield');
    const cloneRule = await addConditionalRule(page);
    await closeSettingsSheet(page);
    await saveAll(page);

    // Clone has both: price+yield bold, two rules.
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    expect(await readCellFontWeight(page, 'yield')).toBe('700');
    expect(await countRowsWithRuleClass(page, origRule)).toBeGreaterThan(0);

    // Origin: price bold only, yield NOT bold, only the original rule.
    await switchToProfile(page, 'origin', 'Origin');
    await closeSettingsSheet(page);
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    expect(await readCellFontWeight(page, 'yield')).not.toBe('700');
    expect(await countRowsWithRuleClass(page, origRule)).toBeGreaterThan(0);
    expect(await countRowsWithRuleClass(page, cloneRule)).toBe(0);
  });
});

test.describe('v2 profile stress — storage integrity', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('storage row count matches popover row count at every step', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await createProfile(page, `Step-${i}`);
      const stored = await readStoredProfiles(page);
      await openProfilePopover(page);
      const uiRows = await page.locator('[data-testid^="profile-row-"]').count();
      expect(uiRows).toBe(stored.length);
      // Close to avoid interference with next create.
      await page.keyboard.press('Escape');
    }
  });

  test('clone under a busy session — no duplicate ids in IndexedDB', async ({ page }) => {
    await createProfile(page, 'Busy');
    for (let i = 0; i < 3; i++) {
      await switchToProfile(page, 'busy', 'Busy');
      await cloneProfile(page, 'busy', 'Busy');
    }
    const stored = await readStoredProfiles(page);
    const ids = stored.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // no dupes
  });

  test('deleting all user profiles leaves ONLY Default in storage', async ({ page }) => {
    for (const n of ['P1', 'P2', 'P3', 'P4']) await createProfile(page, n);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      await switchToProfile(page, id, id.toUpperCase());
      await deleteProfile(page, id);
    }
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toEqual(['__default__']);
  });

  test('active-profile pointer never references a deleted id', async ({ page }) => {
    await createProfile(page, 'Doomed');
    await deleteProfile(page, 'doomed');
    const active = await readActiveProfileId(page);
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toContain(active);
  });

  test('reload after rapid create/delete cycle returns to Default cleanly', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await createProfile(page, `Cycle-${i}`);
      await deleteProfile(page, `cycle-${i}`);
    }
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    await expect(profileTrigger(page)).toContainText('Default');
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toEqual(['__default__']);
  });

  test('switching to a freshly-created empty profile never shows stale state from prior profile', async ({ page }) => {
    await createProfile(page, 'Stale');
    await openFormatterToolbar(page);
    await clickBoldOn(page, 'spread');
    await clickBoldOn(page, 'price');
    const rule = await addConditionalRule(page);
    await closeSettingsSheet(page);
    await saveAll(page);

    // Create a fresh profile — MUST see blank state, not Stale's.
    await createProfile(page, 'Fresh');
    expect(await readCellFontWeight(page, 'spread')).not.toBe('700');
    expect(await readCellFontWeight(page, 'price')).not.toBe('700');
    expect(await countRowsWithRuleClass(page, rule)).toBe(0);
  });
});
