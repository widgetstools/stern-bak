import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Profile-lifecycle harness, hosted on `markets-grid-lab` (:5300).
 *
 * The originals ran against `demo-react`, which was deleted in the app
 * curation — see `apps/E2E_STATUS.md`. The lab's **Profiles** tab is the
 * natural replacement: its preset gallery opens a real `MarketsGrid` with
 * `showProfileSelector` / `showSaveButton` / `showSettingsButton` and a live
 * storage adapter, which is the whole surface these specs need.
 *
 * Two things had to change in the port, and only two:
 *
 *   1. **Boot.** `bootCleanDemo` waited on `[data-grid-id="demo-blotter-v2"]`.
 *      Here, `bootLabProfiles` opens a preset from the gallery and waits on
 *      that preset's grid id.
 *   2. **Storage.** demo-react persisted through ConfigService into IndexedDB
 *      (`marketsui-config` → `appConfig`, filtered by appId/userId). The lab
 *      uses `createMarketsGridLocalStorageStorage()`, so the probes read
 *      `markets-grid-bundle:<gridId>` and `gc-active-profile:<gridId>`.
 *
 * Everything else — every locator, every action — is host-agnostic and is a
 * straight lift, because it only ever touched `ProfileSelector` testids.
 */

/** The preset these specs drive. Its grid id IS the preset id. */
export const LAB_PROFILES_URL = 'http://localhost:5300/';
export const PRESET_ID = 'preset-trader-view';
export const PRESET_NAME = 'Trader View';

// ─── Locators ──────────────────────────────────────────────────────

export function profileTrigger(page: Page): Locator {
  return page.locator('[data-testid="profile-selector-trigger"]');
}

export function profilePopover(page: Page): Locator {
  return page.locator('[data-testid="profile-selector-popover"]');
}

export function profileRow(page: Page, id: string): Locator {
  return page.locator(`[data-testid="profile-row-${id}"]`);
}

export function profileCloneBtn(page: Page, id: string): Locator {
  return page.locator(`[data-testid="profile-clone-${id}"]`);
}

/** No testid on the trash icon itself — the confirm dialog carries those. */
export function profileDeleteBtn(page: Page, id: string): Locator {
  return profileRow(page, id).locator('button[title="Delete layout"]');
}

/**
 * Reveal a row's action cluster.
 *
 * `.ds-ps-row-actions` is `opacity: 0; pointer-events: none` until
 * `.ds-ps-row:hover` or `:focus-within` (ProfileSelector.css:208). Without an
 * explicit hover, Playwright's hit-test resolves to the row rather than the
 * icon and the click retries until the test times out — which is exactly how
 * every clone/delete case failed on the first run of this port.
 */
export async function revealRowActions(page: Page, id: string): Promise<void> {
  await profileRow(page, id).hover();
  await expect(profileCloneBtn(page, id).or(profileDeleteBtn(page, id)).first())
    .toBeVisible();
}

export function deleteConfirmDialog(page: Page): Locator {
  return page.locator('[data-testid="profile-delete-confirm"]');
}

export function deleteConfirmBtn(page: Page): Locator {
  return page.locator('[data-testid="profile-delete-confirm-btn"]');
}

export function deleteCancelBtn(page: Page): Locator {
  return page.locator('[data-testid="profile-delete-cancel"]');
}

export function saveAllBtn(page: Page): Locator {
  return page.locator('[data-testid="save-all-btn"]');
}

// ─── Boot ──────────────────────────────────────────────────────────

/**
 * Open the Profiles tab's preset gallery and mount the preset's grid.
 *
 * Exported as {@link reopenPreset} because the lab keeps its active tab in
 * component state, not the URL — a `page.reload()` lands back on the default
 * tab, so any spec asserting persistence across a reload has to navigate
 * again. demo-react had the grid at `/`, so its ports did not need this.
 */
async function openPreset(page: Page): Promise<void> {
  await page.goto(LAB_PROFILES_URL);
  await page.getByTestId('lab-tab-profiles').click();
  // The gallery cards carry no testid; each is a Button whose heading is the
  // preset name, so filter on that rather than the card's full accessible
  // name (which folds in the tagline and the "Open lens →" affordance).
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: PRESET_NAME, exact: true }) })
    .first()
    .click();
  await page.waitForSelector(`[data-grid-id="${PRESET_ID}"]`, { timeout: 20_000 });
  await page.waitForSelector('.ag-row', { timeout: 20_000 });
}

/** Navigate back to the preset's grid, preserving whatever is stored. */
export async function reopenPreset(page: Page): Promise<void> {
  await openPreset(page);
}

/**
 * A clean grid: storage for this preset wiped, then remounted so the
 * Default profile re-seeds. Every spec starts here, so they are
 * order-independent.
 */
export async function bootLabProfiles(page: Page): Promise<void> {
  // Land on the app first so `localStorage` is same-origin, wipe before the
  // grid mounts, then open the preset once. Opening it, wiping, and opening
  // again also works but pays for two grid boots per test.
  await page.goto(LAB_PROFILES_URL);
  await page.evaluate((gridId) => {
    localStorage.removeItem(`markets-grid-bundle:${gridId}`);
    localStorage.removeItem(`gc-active-profile:${gridId}`);
  }, PRESET_ID);
  await openPreset(page);
  // The Default-profile auto-seed lands a tick after the grid is ready.
  await expect(profileTrigger(page)).toContainText('Default', { timeout: 10_000 });
}

// ─── Storage probes ────────────────────────────────────────────────

export interface StoredProfile {
  id: string;
  name: string;
  gridId: string;
  state: Record<string, unknown>;
}

/** Profiles as persisted, straight out of localStorage. */
export async function readStoredProfiles(page: Page): Promise<StoredProfile[]> {
  return page.evaluate((gridId) => {
    const raw = localStorage.getItem(`markets-grid-bundle:${gridId}`);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { profiles?: StoredProfile[] };
      return Array.isArray(parsed.profiles) ? parsed.profiles : [];
    } catch {
      return [];
    }
  }, PRESET_ID) as Promise<StoredProfile[]>;
}

export async function readActiveProfileId(page: Page): Promise<string | null> {
  return page.evaluate(
    (gridId) => localStorage.getItem(`gc-active-profile:${gridId}`),
    PRESET_ID,
  );
}

/** One stored profile by id, or `undefined`. */
export async function readStoredProfile(
  page: Page,
  id: string,
): Promise<StoredProfile | undefined> {
  return (await readStoredProfiles(page)).find((p) => p.id === id);
}

// ─── Actions ───────────────────────────────────────────────────────

export async function openProfilePopover(page: Page): Promise<void> {
  if (await profilePopover(page).isVisible().catch(() => false)) return;
  await profileTrigger(page).click();
  await expect(profilePopover(page)).toBeVisible();
}

export async function closeProfilePopover(page: Page): Promise<void> {
  if (!(await profilePopover(page).isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape');
  await expect(profilePopover(page)).toHaveCount(0);
}

/**
 * Create a profile through the popover's name input. `ProfileManager.create()`
 * is an explicit write, so the new profile is active AND persisted without a
 * Save click — that is what the specs assert.
 */
export async function createProfile(page: Page, name: string): Promise<void> {
  await openProfilePopover(page);
  await page.locator('[data-testid="profile-name-input"]').fill(name);
  await page.locator('[data-testid="profile-create-btn"]').click();
  await expect(profileTrigger(page)).toContainText(name.trim());
  await closeProfilePopover(page);
}

/** Switch by id, discarding unsaved churn if the dirty prompt appears. */
export async function switchToProfile(
  page: Page,
  id: string,
  displayName: string,
  options: { onDirty?: 'discard' | 'save' } = {},
): Promise<void> {
  await openProfilePopover(page);
  await profileRow(page, id).click();
  const dirty = page
    .locator('[role="alertdialog"]')
    .filter({ hasText: /unsaved changes|discard|save/i })
    .first();
  if (await dirty.isVisible({ timeout: 500 }).catch(() => false)) {
    const label = options.onDirty === 'save' ? /save/i : /discard/i;
    await dirty.locator('button').filter({ hasText: label }).first().click();
  }
  await expect(profileTrigger(page)).toContainText(displayName);
  await closeProfilePopover(page);
}

/**
 * Clone via the row's clone icon. The host composes a de-duped
 * "(copy)" / "(copy 2)" name, so the caller gets the resulting name back
 * rather than guessing which suffix applied.
 */
export async function cloneProfile(page: Page, sourceId: string): Promise<string> {
  await openProfilePopover(page);
  await revealRowActions(page, sourceId);
  await profileCloneBtn(page, sourceId).click();
  await expect(profileTrigger(page)).toContainText('(copy', { timeout: 10_000 });
  const name = (await profileTrigger(page).textContent())?.trim() ?? '';

  // Cloning drops the new row straight into rename mode and pins the popover
  // open (`handleClone` → `setRenamingId` + `blockPopoverDismissRef`), so the
  // user can name the copy immediately. That means the first Escape cancels
  // the rename rather than closing the popover — accept the composed name,
  // then close.
  const renameInput = page.locator(`[data-testid^="profile-rename-input-"]`);
  if (await renameInput.first().isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(renameInput.first()).toHaveCount(0);
  }
  await closeProfilePopover(page);
  return name;
}

export async function deleteProfile(page: Page, id: string): Promise<void> {
  await openProfilePopover(page);
  await revealRowActions(page, id);
  await profileDeleteBtn(page, id).click();
  await expect(deleteConfirmDialog(page)).toBeVisible();
  await deleteConfirmBtn(page).click();
  await expect(deleteConfirmDialog(page)).toHaveCount(0);
  await expect(profileRow(page, id)).toHaveCount(0);
}

/** Save pending changes. No-op when the button is disabled (nothing dirty). */
export async function saveAll(page: Page): Promise<void> {
  await closeProfilePopover(page);
  const btn = saveAllBtn(page);
  if (await btn.isDisabled().catch(() => true)) return;
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 10_000 });
}
