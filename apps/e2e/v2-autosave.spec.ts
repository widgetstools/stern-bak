import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for @wellsfargo-starui/markets-grid — explicit-save profile contract.
 *
 * Profiles used to auto-persist every change via a 300ms debounce.
 * That silently captured edits the user hadn't committed, which was
 * confusing in practice — profiles now behave like saved documents:
 * changes live in-memory until the user clicks Save, and a dirty
 * indicator plus an unsaved-changes prompt guard the "switch / reload
 * while dirty" paths.
 *
 * This spec (still filed as "autosave" for historical continuity)
 * proves the current contract:
 *  - Default is still auto-seeded on first mount.
 *  - User-created profiles persist on creation (create() is an
 *    explicit write path — no debounce needed).
 *  - Changes made AFTER save do NOT persist on reload unless Save is
 *    clicked. A captured filter pill that hasn't been saved disappears.
 *  - A captured filter pill, once saved, survives reload.
 *  - The Save button surfaces a dirty indicator (`data-state="dirty"`
 *    plus a `save-all-dirty` child) while there are unsaved edits and
 *    clears it after a save.
 *  - Switching profiles while dirty triggers the AlertDialog with
 *    three actions: Cancel / Discard / Save-and-switch.
 */

const V2_PATH = '/';

async function waitForV2Grid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-grid-viewport .ag-row', { timeout: 15_000 });
  // Profile manager boot + initial dirty-subscription hookup.
  await page.waitForTimeout(400);
}

async function clearV2Storage(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('marketsui-config');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('profile-migration-v1');
  });
}

function profileTrigger(page: Page) {
  return page.locator('[data-testid="profile-selector-trigger"]');
}

async function openProfilePopover(page: Page) {
  await profileTrigger(page).click();
  await page.locator('[data-testid="profile-selector-popover"]').waitFor({ state: 'visible' });
}

async function createProfile(page: Page, name: string) {
  await openProfilePopover(page);
  await page.locator('[data-testid="profile-name-input"]').fill(name);
  await page.locator('[data-testid="profile-create-btn"]').click();
  await expect(profileTrigger(page)).toContainText(name);
}

async function setFilterModel(page: Page, model: Record<string, unknown>) {
  await page.evaluate((m) => {
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return;
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (root as any)[fiberKey];
    for (let i = 0; i < 80 && fiber; i++) {
      const candidates: any[] = [];
      if (fiber.stateNode?.api) candidates.push(fiber.stateNode.api);
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState?.api) candidates.push(s.memoizedState.api);
          if (s.memoizedState?.current?.api) candidates.push(s.memoizedState.current.api);
          s = s.next;
        }
      }
      for (const api of candidates) {
        if (api && typeof api.setFilterModel === 'function') {
          api.setFilterModel(m);
          return;
        }
      }
      fiber = fiber.return;
    }
  }, model);
  await page.waitForTimeout(250);
}

async function clickSaveAll(page: Page) {
  await page.locator('[data-testid="save-all-btn"]').click();
  // Dirty flag clears synchronously on save; the 600ms flash is cosmetic.
  await page.waitForTimeout(200);
}

async function captureCurrentFilter(page: Page) {
  await page.locator('.ds-filters-add-btn').click();
  await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
}

test.describe('v2 — explicit save (profiles = committed snapshots)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
    await clearV2Storage(page);
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
  });

  test('Default profile is auto-seeded on first mount (reserved + Lock, not Trash)', async ({ page }) => {
    await expect(profileTrigger(page)).toContainText('Default');

    await openProfilePopover(page);
    const defaultRow = page.locator('[data-testid="profile-row-__default__"]');
    await expect(defaultRow).toBeVisible();
    await expect(defaultRow.locator('button[title="Delete profile"]')).toHaveCount(0);
  });

  test('user-created profile persists across reload (create() is an explicit write)', async ({ page }) => {
    await createProfile(page, 'Persist-Test');

    // Profile creation is an explicit write, not a debounced auto-save —
    // no Save click needed. Reload + assert the profile + the last-active
    // pointer both survived.
    await page.reload();
    await waitForV2Grid(page);

    await expect(profileTrigger(page)).toContainText('Persist-Test');

    await openProfilePopover(page);
    await expect(page.locator('[data-testid="profile-row-__default__"]')).toBeVisible();
    const popover = page.locator('[data-testid="profile-selector-popover"]');
    await expect(popover.getByText('Persist-Test', { exact: true })).toBeVisible();
  });

  test('unsaved filter pill DOES NOT persist across reload (explicit save contract)', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    // Note: NO Save click. Reload — the pill must vanish because nothing
    // was committed to disk. This is the core behavior the refactor
    // introduced.
    await page.reload();
    await waitForV2Grid(page);

    await expect(page.locator('.ds-filter-pill')).toHaveCount(0);
  });

  test('saved filter pill SURVIVES reload after clicking Save', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await clickSaveAll(page);

    await page.reload();
    await waitForV2Grid(page);

    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });

  test('Save button surfaces a dirty indicator while there are unsaved edits', async ({ page }) => {
    const saveBtn = page.locator('[data-testid="save-all-btn"]');
    await expect(saveBtn).toHaveAttribute('data-state', 'idle');

    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await expect(saveBtn).toHaveAttribute('data-state', 'dirty');

    await clickSaveAll(page);
    await page.waitForTimeout(800);
    await expect(saveBtn).toHaveAttribute('data-state', 'idle');
  });

  test('switching profiles while dirty opens the unsaved-changes AlertDialog', async ({ page }) => {
    await createProfile(page, 'Switch-Target');

    // Go back to Default so we have somewhere to switch TO and FROM.
    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-__default__"]').click();
    await expect(profileTrigger(page)).toContainText('Default');

    // Make Default dirty.
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);
    await expect(page.locator('[data-testid="save-all-btn"]')).toHaveAttribute('data-state', 'dirty');

    // Try to switch. The AlertDialog intercepts.
    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-switch-target"]').click();
    await expect(page.locator('[data-testid="profile-switch-confirm"]')).toBeVisible();

    // Cancel keeps us where we are + preserves dirty state.
    await page.locator('[data-testid="profile-switch-cancel"]').click();
    await expect(page.locator('[data-testid="profile-switch-confirm"]')).toHaveCount(0);
    await expect(profileTrigger(page)).toContainText('Default');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });

  test('Discard path on profile switch throws away unsaved edits + switches', async ({ page }) => {
    await createProfile(page, 'Discard-Target');

    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-__default__"]').click();
    await expect(profileTrigger(page)).toContainText('Default');

    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-discard-target"]').click();
    await page.locator('[data-testid="profile-switch-discard"]').click();

    // We landed on the target profile, and the pill we captured under
    // Default was thrown away.
    await expect(profileTrigger(page)).toContainText('Discard-Target');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(0);

    // Going back to Default should also show no pill — the discard
    // reverted the in-memory state to the last saved snapshot of
    // Default, which had no pills.
    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-__default__"]').click();
    await expect(profileTrigger(page)).toContainText('Default');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(0);
  });

  test('Save-and-switch path writes the outgoing profile then switches', async ({ page }) => {
    await createProfile(page, 'Save-Target');

    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-__default__"]').click();
    await expect(profileTrigger(page)).toContainText('Default');

    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-save-target"]').click();
    await page.locator('[data-testid="profile-switch-save"]').click();

    // We landed on the target profile. Default now persists the pill
    // we saved at switch-time: flipping back proves the write succeeded.
    await expect(profileTrigger(page)).toContainText('Save-Target');

    await openProfilePopover(page);
    await page.locator('[data-testid="profile-row-__default__"]').click();
    await expect(profileTrigger(page)).toContainText('Default');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });
});
