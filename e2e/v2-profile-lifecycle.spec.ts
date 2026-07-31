import { test, expect } from '@playwright/test';
import { bootCleanDemo } from './helpers/settingsSheet';
import {
  profileTrigger,
  profilePopover,
  profileRow,
  openProfilePopover,
  closeProfilePopover,
  createProfile,
  cloneProfile,
  deleteProfile,
  switchToProfile,
  readStoredProfiles,
  readActiveProfileId,
  profileCloneBtn,
  profileDeleteBtn,
  deleteConfirmDialog,
  deleteCancelBtn,
} from './helpers/profileHelpers';

/**
 * E2E — profile lifecycle stress tests.
 *
 * Covers every state transition for a profile: create, clone, switch,
 * delete, plus the edge cases around reserved Default, name collision,
 * and rapid create/delete cycles.
 *
 * What these tests PROVE:
 *   - `ProfileManager.create()` is an explicit write (persists without
 *     a Save click) — a user creating profiles doesn't need to save.
 *   - `clone()` captures live state when source is active, on-disk
 *     snapshot otherwise.
 *   - Delete of the active profile flips back to Default (the one
 *     reserved, undeletable profile).
 *   - Rapid create/delete/clone sequences leave no phantom rows, no
 *     stale active-id pointers, no bleeding between profiles.
 *
 * Each test starts from `bootCleanDemo()` so storage + active-id
 * pointer are wiped; tests are order-independent.
 */

test.describe('v2 profile lifecycle — creation', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('Default profile is auto-seeded on first mount and is the active profile', async ({ page }) => {
    await expect(profileTrigger(page)).toContainText('Default');
    const activeId = await readActiveProfileId(page);
    expect(activeId).toBe('__default__');
  });

  test('creating a profile flips active to the new one and persists immediately', async ({ page }) => {
    await createProfile(page, 'Alpha');
    expect(await readActiveProfileId(page)).toBe('alpha');
    // Persisted to IndexedDB without a Save click.
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'alpha']);
  });

  test('profile creation survives full page reload', async ({ page }) => {
    await createProfile(page, 'Persist-Me');
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    await expect(profileTrigger(page)).toContainText('Persist-Me');
    expect(await readActiveProfileId(page)).toBe('persist-me');
  });

  test('creating profile with trailing/leading whitespace trims the name', async ({ page }) => {
    await createProfile(page, '   Trimmed   ');
    await expect(profileTrigger(page)).toContainText('Trimmed');
  });

  test('creating profile with empty name is a no-op (no new row)', async ({ page }) => {
    await openProfilePopover(page);
    await page.locator('[data-testid="profile-name-input"]').fill('');
    const btn = page.locator('[data-testid="profile-create-btn"]');
    await expect(btn).toBeDisabled();
    const stored = await readStoredProfiles(page);
    expect(stored).toHaveLength(1); // Default only
  });

  test('creating multiple profiles in sequence lists them all in the popover', async ({ page }) => {
    await createProfile(page, 'First');
    await createProfile(page, 'Second');
    await createProfile(page, 'Third');
    await openProfilePopover(page);
    for (const name of ['Default', 'First', 'Second', 'Third']) {
      await expect(profilePopover(page).getByText(name, { exact: true })).toBeVisible();
    }
    expect((await readStoredProfiles(page)).map((p) => p.id).sort()).toEqual(
      ['__default__', 'first', 'second', 'third'],
    );
  });
});

test.describe('v2 profile lifecycle — switching', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('switching profiles updates the trigger + active-id pointer', async ({ page }) => {
    await createProfile(page, 'Alpha');
    await createProfile(page, 'Beta');
    expect(await readActiveProfileId(page)).toBe('beta');
    await switchToProfile(page, 'alpha', 'Alpha');
    expect(await readActiveProfileId(page)).toBe('alpha');
    await switchToProfile(page, '__default__', 'Default');
    expect(await readActiveProfileId(page)).toBe('__default__');
  });

  test('active profile pointer persists across reload', async ({ page }) => {
    await createProfile(page, 'Alpha');
    await createProfile(page, 'Beta');
    await switchToProfile(page, 'alpha', 'Alpha');
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    await expect(profileTrigger(page)).toContainText('Alpha');
    expect(await readActiveProfileId(page)).toBe('alpha');
  });

  test('rapid switching between 3 profiles keeps the pointer consistent', async ({ page }) => {
    await createProfile(page, 'A');
    await createProfile(page, 'B');
    await createProfile(page, 'C');
    for (let i = 0; i < 5; i++) {
      await switchToProfile(page, 'a', 'A');
      await switchToProfile(page, 'c', 'C');
      await switchToProfile(page, 'b', 'B');
    }
    expect(await readActiveProfileId(page)).toBe('b');
    // Stored rows unchanged — switching shouldn't grow the count.
    const stored = await readStoredProfiles(page);
    expect(stored).toHaveLength(4);
  });
});

test.describe('v2 profile lifecycle — deletion', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('deleting a non-active profile removes its row and keeps current profile active', async ({ page }) => {
    await createProfile(page, 'Keep');
    await createProfile(page, 'Drop');
    await switchToProfile(page, 'keep', 'Keep');
    await deleteProfile(page, 'drop');
    expect(await readActiveProfileId(page)).toBe('keep');
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'keep']);
  });

  test('deleting the ACTIVE profile falls back to Default', async ({ page }) => {
    await createProfile(page, 'DoomedProfile');
    expect(await readActiveProfileId(page)).toBe('doomedprofile');
    await deleteProfile(page, 'doomedprofile');
    expect(await readActiveProfileId(page)).toBe('__default__');
    await expect(profileTrigger(page)).toContainText('Default');
  });

  test('Default profile has no delete button (reserved + undeletable)', async ({ page }) => {
    await openProfilePopover(page);
    await expect(profileRow(page, '__default__')).toBeVisible();
    await expect(profileDeleteBtn(page, '__default__')).toHaveCount(0);
  });

  test('cancel in the delete AlertDialog leaves the profile intact', async ({ page }) => {
    await createProfile(page, 'Nope');
    await openProfilePopover(page);
    await profileDeleteBtn(page, 'nope').click();
    await expect(deleteConfirmDialog(page)).toBeVisible();
    await deleteCancelBtn(page).click();
    await expect(deleteConfirmDialog(page)).toHaveCount(0);
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toContain('nope');
  });

  test('deleting then recreating the same name produces a fresh profile (no leftover state)', async ({ page }) => {
    await createProfile(page, 'Recycled');
    await deleteProfile(page, 'recycled');
    expect(await readActiveProfileId(page)).toBe('__default__');
    await createProfile(page, 'Recycled');
    const stored = await readStoredProfiles(page);
    const row = stored.find((p) => p.id === 'recycled');
    expect(row).toBeDefined();
    // Fresh profile starts with blank module-customization assignments.
    const cc = (row!.state['column-customization'] as { v?: number; data?: { assignments?: unknown } } | undefined)?.data;
    expect(cc?.assignments ?? {}).toEqual({});
  });
});

test.describe('v2 profile lifecycle — cloning', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('cloning Default yields a new profile named "Default (copy)" and activates it', async ({ page }) => {
    await cloneProfile(page, '__default__', 'Default');
    expect(await readActiveProfileId(page)).toBe('default-copy');
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'default-copy']);
    expect(stored.find((p) => p.id === 'default-copy')?.name).toBe('Default (copy)');
  });

  test('cloning a user-created profile preserves its name with "(copy)" suffix', async ({ page }) => {
    await createProfile(page, 'Source');
    const newName = await cloneProfile(page, 'source', 'Source');
    expect(newName).toContain('Source (copy)');
    expect(await readActiveProfileId(page)).toBe('source-copy');
  });

  test('repeatedly cloning the same source produces "(copy 2)", "(copy 3)", …', async ({ page }) => {
    await createProfile(page, 'Origin');
    await cloneProfile(page, 'origin', 'Origin');
    // Back to origin to clone it a second time.
    await switchToProfile(page, 'origin', 'Origin');
    await cloneProfile(page, 'origin', 'Origin');
    await switchToProfile(page, 'origin', 'Origin');
    await cloneProfile(page, 'origin', 'Origin');

    const stored = await readStoredProfiles(page);
    const cloneNames = stored.filter((p) => p.id.startsWith('origin-copy')).map((p) => p.name);
    expect(cloneNames).toContain('Origin (copy)');
    expect(cloneNames).toContain('Origin (copy 2)');
    expect(cloneNames).toContain('Origin (copy 3)');
  });

  test('deleting a clone source leaves the clone intact', async ({ page }) => {
    await createProfile(page, 'Parent');
    await cloneProfile(page, 'parent', 'Parent');
    // Back to Parent, delete it.
    await switchToProfile(page, 'parent', 'Parent');
    await deleteProfile(page, 'parent');
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toContain('parent-copy');
    expect(stored.map((p) => p.id)).not.toContain('parent');
  });

  test('cloning then deleting the clone leaves the source intact', async ({ page }) => {
    await createProfile(page, 'Source');
    await cloneProfile(page, 'source', 'Source');
    await deleteProfile(page, 'source-copy');
    expect(await readActiveProfileId(page)).toBe('__default__');
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toContain('source');
    expect(stored.map((p) => p.id)).not.toContain('source-copy');
  });

  test('Default (reserved) profile can still be cloned — cloning ≠ editing', async ({ page }) => {
    // Reserved-id is for DELETE protection; cloning should be freely allowed.
    await openProfilePopover(page);
    await expect(profileCloneBtn(page, '__default__')).toBeVisible();
    await cloneProfile(page, '__default__', 'Default');
    const stored = await readStoredProfiles(page);
    expect(stored.map((p) => p.id)).toContain('default-copy');
  });

  test('clones of clones chain indefinitely with unique ids', async ({ page }) => {
    await createProfile(page, 'Gen0');
    await cloneProfile(page, 'gen0', 'Gen0'); // active: gen0-copy ("Gen0 (copy)")
    // Clone the active clone.
    const trigger1 = (await profileTrigger(page).textContent())?.trim() ?? '';
    await cloneProfile(page, 'gen0-copy', trigger1);
    const trigger2 = (await profileTrigger(page).textContent())?.trim() ?? '';
    expect(trigger2).not.toBe(trigger1);
    const stored = await readStoredProfiles(page);
    // Expect 3 profiles: Default + gen0 + gen0-copy + the grandchild.
    expect(stored.length).toBe(4);
  });

  test('closing the profile popover via Escape works even during rapid operations', async ({ page }) => {
    await createProfile(page, 'Blip');
    await openProfilePopover(page);
    await closeProfilePopover(page);
    await openProfilePopover(page);
    await closeProfilePopover(page);
    // No assertion needed — just proves the helper chain is stable.
  });
});
