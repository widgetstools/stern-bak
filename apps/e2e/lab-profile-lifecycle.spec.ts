import { test, expect } from '@playwright/test';
import {
  PRESET_ID,
  bootLabProfiles,
  cloneProfile,
  closeProfilePopover,
  createProfile,
  deleteCancelBtn,
  deleteConfirmDialog,
  deleteProfile,
  openProfilePopover,
  profileDeleteBtn,
  profilePopover,
  profileRow,
  profileTrigger,
  readActiveProfileId,
  readStoredProfiles,
  reopenPreset,
  revealRowActions,
  switchToProfile,
} from './helpers/labProfiles';

/**
 * Profile lifecycle — every state transition a profile goes through: create,
 * switch, delete, clone, plus the edges around the reserved Default, name
 * trimming, and repeated operations.
 *
 * Ported from the deleted `v2-profile-lifecycle.spec.ts`, which ran against
 * `demo-react`. What it proves is unchanged:
 *
 *   - `ProfileManager.create()` is an explicit write — a user creating a
 *     profile does not have to press Save for it to survive a reload.
 *   - Deleting the active profile falls back to Default, the one reserved,
 *     undeletable profile.
 *   - Clone de-dupes its own name, and clone ≠ edit, so even Default clones.
 *   - Repeated create/clone/delete leaves no phantom rows and no stale
 *     active-id pointer.
 *
 * These are the assertions a unit test cannot make: they run against real AG
 * Grid, real persistence, and a real page reload.
 */

test.describe.configure({ timeout: 120_000 });

test.describe('profile lifecycle — creation', () => {
  test.beforeEach(async ({ page }) => { await bootLabProfiles(page); });

  test('Default is auto-seeded on first mount and is the active profile', async ({ page }) => {
    await expect(profileTrigger(page)).toContainText('Default');
    expect(await readActiveProfileId(page)).toBe('__default__');
  });

  test('creating a profile flips active to it and persists without a Save', async ({ page }) => {
    await createProfile(page, 'Alpha');

    expect(await readActiveProfileId(page)).toBe('alpha');
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'alpha']);
  });

  test('a created profile survives a full page reload', async ({ page }) => {
    await createProfile(page, 'Persist-Me');
    await page.reload();
    await reopenPreset(page);

    await expect(profileTrigger(page)).toContainText('Persist-Me');
    expect(await readActiveProfileId(page)).toBe('persist-me');
  });

  test('the name is trimmed', async ({ page }) => {
    await createProfile(page, '  Spaced Out  ');

    await expect(profileTrigger(page)).toContainText('Spaced Out');
    const stored = await readStoredProfiles(page);
    expect(stored.find((p) => p.name === 'Spaced Out')).toBeDefined();
  });

  test('a whitespace-only name cannot be submitted', async ({ page }) => {
    await openProfilePopover(page);
    await page.locator('[data-testid="profile-name-input"]').fill('   ');

    // The guard is the disabled button, not a rejected write — so assert the
    // button rather than clicking it, which would wait out the clock.
    await expect(page.locator('[data-testid="profile-create-btn"]')).toBeDisabled();
    await closeProfilePopover(page);

    expect((await readStoredProfiles(page)).map((p) => p.id)).toEqual(['__default__']);
    expect(await readActiveProfileId(page)).toBe('__default__');
  });

  test('several profiles in sequence all list in the popover', async ({ page }) => {
    for (const name of ['One', 'Two', 'Three']) await createProfile(page, name);
    await openProfilePopover(page);

    for (const id of ['__default__', 'one', 'two', 'three']) {
      await expect(profileRow(page, id)).toBeVisible();
    }
  });
});

test.describe('profile lifecycle — switching', () => {
  test.beforeEach(async ({ page }) => { await bootLabProfiles(page); });

  test('switching updates the trigger and the active-id pointer', async ({ page }) => {
    await createProfile(page, 'Alpha');
    await switchToProfile(page, '__default__', 'Default');

    await expect(profileTrigger(page)).toContainText('Default');
    expect(await readActiveProfileId(page)).toBe('__default__');
  });

  test('the active pointer survives a reload', async ({ page }) => {
    await createProfile(page, 'Alpha');
    await createProfile(page, 'Beta');
    await switchToProfile(page, 'alpha', 'Alpha');

    await page.reload();
    await reopenPreset(page);
    await expect(profileTrigger(page)).toContainText('Alpha');
    expect(await readActiveProfileId(page)).toBe('alpha');
  });

  test('rapid switching between three profiles keeps the pointer consistent', async ({ page }) => {
    for (const name of ['A1', 'B1', 'C1']) await createProfile(page, name);

    for (const [id, name] of [['a1', 'A1'], ['b1', 'B1'], ['c1', 'C1'], ['a1', 'A1']] as const) {
      await switchToProfile(page, id, name);
      expect(await readActiveProfileId(page)).toBe(id);
    }
  });
});

test.describe('profile lifecycle — deletion', () => {
  test.beforeEach(async ({ page }) => { await bootLabProfiles(page); });

  test('deleting a non-active profile keeps the current one active', async ({ page }) => {
    await createProfile(page, 'Keeper');
    await createProfile(page, 'Doomed');
    await switchToProfile(page, 'keeper', 'Keeper');

    await deleteProfile(page, 'doomed');

    await expect(profileTrigger(page)).toContainText('Keeper');
    expect(await readActiveProfileId(page)).toBe('keeper');
  });

  test('deleting the ACTIVE profile falls back to Default', async ({ page }) => {
    await createProfile(page, 'Doomed');
    expect(await readActiveProfileId(page)).toBe('doomed');

    await deleteProfile(page, 'doomed');

    await expect(profileTrigger(page)).toContainText('Default');
    expect(await readActiveProfileId(page)).toBe('__default__');
  });

  test('Default is reserved and has no delete button', async ({ page }) => {
    await openProfilePopover(page);
    await expect(profileRow(page, '__default__')).toBeVisible();
    await revealRowActions(page, '__default__');

    // Revealed, and still no trash — absence, not merely hidden chrome.
    await expect(profileDeleteBtn(page, '__default__')).toHaveCount(0);
  });

  test('cancelling the confirm leaves the profile intact', async ({ page }) => {
    await createProfile(page, 'Survivor');
    await openProfilePopover(page);
    await revealRowActions(page, 'survivor');
    await profileDeleteBtn(page, 'survivor').click();
    await expect(deleteConfirmDialog(page)).toBeVisible();

    await deleteCancelBtn(page).click();
    await expect(deleteConfirmDialog(page)).toHaveCount(0);

    expect((await readStoredProfiles(page)).map((p) => p.id)).toContain('survivor');
  });

  test('deleting then recreating the same name yields a fresh profile', async ({ page }) => {
    await createProfile(page, 'Recycled');
    await deleteProfile(page, 'recycled');
    await createProfile(page, 'Recycled');

    const stored = await readStoredProfiles(page);
    expect(stored.filter((p) => p.id === 'recycled')).toHaveLength(1);
    expect(await readActiveProfileId(page)).toBe('recycled');
  });
});

test.describe('profile lifecycle — cloning', () => {
  test.beforeEach(async ({ page }) => { await bootLabProfiles(page); });

  test('cloning Default yields a copy and activates it', async ({ page }) => {
    const name = await cloneProfile(page, '__default__');

    expect(name).toMatch(/^Default \(copy/);
    // Clone ≠ edit: the reserved profile is still there, untouched.
    expect((await readStoredProfiles(page)).map((p) => p.id)).toContain('__default__');
    expect(await readActiveProfileId(page)).not.toBe('__default__');
  });

  test('cloning a user profile keeps its name with a (copy) suffix', async ({ page }) => {
    await createProfile(page, 'Source');
    const name = await cloneProfile(page, 'source');

    expect(name).toMatch(/^Source \(copy/);
  });

  test('cloning the same source repeatedly de-dupes the suffix', async ({ page }) => {
    await createProfile(page, 'Multi');
    const first = await cloneProfile(page, 'multi');
    const second = await cloneProfile(page, 'multi');
    const third = await cloneProfile(page, 'multi');

    expect(new Set([first, second, third]).size).toBe(3);
    const ids = (await readStoredProfiles(page)).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('deleting the clone source leaves the clone intact', async ({ page }) => {
    await createProfile(page, 'Parent');
    const cloneName = await cloneProfile(page, 'parent');

    await deleteProfile(page, 'parent');

    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.name)).toContain(cloneName);
    expect(stored.map((p) => p.id)).not.toContain('parent');
  });

  test('deleting a clone leaves its source intact', async ({ page }) => {
    await createProfile(page, 'Origin');
    await cloneProfile(page, 'origin');
    const cloneId = (await readStoredProfiles(page))
      .map((p) => p.id)
      .find((id) => id.startsWith('origin-copy') || (id !== 'origin' && id !== '__default__'));

    await deleteProfile(page, cloneId!);

    expect((await readStoredProfiles(page)).map((p) => p.id)).toContain('origin');
  });

  test('clones of clones chain with unique ids', async ({ page }) => {
    await createProfile(page, 'Chain');
    await cloneProfile(page, 'chain');
    const firstCloneId = (await readActiveProfileId(page))!;
    await cloneProfile(page, firstCloneId);

    const ids = (await readStoredProfiles(page)).map((p) => p.id);
    expect(ids).toHaveLength(4); // Default + Chain + 2 clones
    expect(new Set(ids).size).toBe(4);
  });

  test('Escape closes the popover even after a burst of operations', async ({ page }) => {
    await createProfile(page, 'Burst');
    await cloneProfile(page, 'burst');
    await openProfilePopover(page);

    await page.keyboard.press('Escape');
    await expect(profilePopover(page)).toHaveCount(0);
  });
});
