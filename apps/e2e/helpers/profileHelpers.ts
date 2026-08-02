import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Shared helpers for profile-lifecycle + isolation tests.
 *
 * Built on top of `settingsSheet.ts` (imported where needed by the
 * specs). This file focuses on the ProfileSelector surface and
 * direct IndexedDB probes — the settings-sheet helpers cover module
 * panel navigation.
 *
 * Every helper waits on visible effects (DOM selectors or computed
 * state), never on arbitrary timers, so the tests are robust against
 * host-machine speed differences.
 */

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

/** Delete button is identified by its `title` attribute (no testid on
 *  the icon button itself — the confirm dialog carries the testids).
 *  The UI title is "Delete layout" — the row terminology shifted from
 *  "profile" to "layout" in the ProfileSelector chrome rewrite. */
export function profileDeleteBtn(page: Page, id: string): Locator {
  return profileRow(page, id).locator('button[title="Delete layout"]');
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

// ─── Actions ──────────────────────────────────────────────────────

export async function openProfilePopover(page: Page): Promise<void> {
  if (await profilePopover(page).isVisible().catch(() => false)) return;
  await profileTrigger(page).click();
  await expect(profilePopover(page)).toBeVisible();
}

export async function closeProfilePopover(page: Page): Promise<void> {
  if (!(await profilePopover(page).isVisible().catch(() => false))) return;
  // Escape dismisses the shadcn popover cleanly.
  await page.keyboard.press('Escape');
  await expect(profilePopover(page)).toHaveCount(0);
}

/**
 * Create a new profile via the popover name input. Active profile
 * flips to the newly-created one on success (that's how
 * `ProfileManager.create()` behaves).
 */
export async function createProfile(page: Page, name: string): Promise<void> {
  await openProfilePopover(page);
  await page.locator('[data-testid="profile-name-input"]').fill(name);
  await page.locator('[data-testid="profile-create-btn"]').click();
  await expect(profileTrigger(page)).toContainText(name);
  // Allow the platform resetAll + deserializeAll + transform pipeline
  // + AG-Grid redraw to settle. Without this small pause the next
  // cell-click can race with the grid's post-switch reconciliation
  // and skip cellFocused events that the formatter toolbar listens on.
  await page.waitForTimeout(300);
  // Force AG-Grid to re-evaluate row/cell class rules. The profile
  // switch swaps the underlying state, but AG-Grid caches per-row
  // class sets; without a redraw, stale `.ds-rule-*` classes from the
  // previous profile can linger on visible rows until the next natural
  // redraw (sort, scroll, etc.). The inline hook doesn't wait on a
  // specific DOM change — just gives AG-Grid's sync render loop a tick.
  await forceGridRedraw(page);
}

/**
 * Switch to an existing profile by clicking its row. If the profile is
 * dirty-prompting, the caller should handle the AlertDialog separately.
 */
/**
 * Switch to a profile by id. If the current profile is dirty, the
 * switch triggers an unsaved-changes AlertDialog — we answer
 * "discard" by default since test intent is almost always to move to
 * the saved snapshot of the target, not to preserve auto-dirtied
 * grid-state churn. Callers wanting save-and-switch should set
 * `onDirty: 'save'`.
 */
export async function switchToProfile(
  page: Page,
  id: string,
  displayName: string,
  options: { onDirty?: 'discard' | 'save' } = {},
): Promise<void> {
  await openProfilePopover(page);
  await profileRow(page, id).click();
  // If a dirty-prompt dialog opens, handle it; otherwise fall through.
  const dirtyDialog = page.locator('[role="alertdialog"]').filter({ hasText: /unsaved changes|discard|save/i }).first();
  if (await dirtyDialog.isVisible({ timeout: 500 }).catch(() => false)) {
    const label = options.onDirty === 'save' ? /save.*switch|save.*continue|save/i : /discard/i;
    await dirtyDialog.locator('button').filter({ hasText: label }).first().click();
  }
  // The popover auto-closes on row click; the trigger reflects the new active profile.
  await expect(profileTrigger(page)).toContainText(displayName);
  // Same settle + redraw as createProfile, same rationale.
  await page.waitForTimeout(300);
  await forceGridRedraw(page);
}

/**
 * Clone a profile by clicking its row's clone icon. Markets-grid's host
 * callback composes a de-duped "(copy)" / "(copy 2)" name from the
 * source; we wait for the active profile to flip to the new clone.
 *
 * Returns the clone's display name (so the caller can key off it).
 */
export async function cloneProfile(page: Page, sourceId: string, sourceName: string): Promise<string> {
  await openProfilePopover(page);
  await profileCloneBtn(page, sourceId).click();
  // The clone becomes active after the async cloneProfile() completes.
  // `(copy)` / `(copy 2)` / `(copy 3)` are all valid suffixes depending
  // on how many siblings already exist — match the open-paren + "copy"
  // opening that's guaranteed across all variants.
  await expect(profileTrigger(page)).toContainText('(copy', { timeout: 5000 });
  const actual = (await profileTrigger(page).textContent())?.trim() ?? '';
  // Grid-settle wait + redraw, same rationale as create/switch.
  await page.waitForTimeout(300);
  await forceGridRedraw(page);
  return actual || `${sourceName} (copy)`;
}

/**
 * Delete a profile via its row's trash button + the AlertDialog
 * confirm. If the profile is active, Default becomes active afterward.
 */
export async function deleteProfile(page: Page, id: string): Promise<void> {
  await openProfilePopover(page);
  await profileDeleteBtn(page, id).click();
  await expect(deleteConfirmDialog(page)).toBeVisible();
  await deleteConfirmBtn(page).click();
  await expect(deleteConfirmDialog(page)).toHaveCount(0);
  // Popover closes on open-before-dialog; wait for the row to be gone.
  await expect(profileRow(page, id)).toHaveCount(0);
}

/** Save all changes. Idempotent — no-op when there are no unsaved
 *  changes (the Save button is disabled in that state). Fully tears
 *  down the settings sheet + its backdrop first, since either can
 *  intercept pointer events targeting the global toolbar. */
export async function saveAll(page: Page): Promise<void> {
  await ensureSettingsSheetClosed(page);
  const btn = saveAllBtn(page);
  if (await btn.isDisabled().catch(() => true)) return;
  await btn.click();
  // Dirty state clears synchronously; the flash is cosmetic.
  await page.waitForTimeout(200);
}

/**
 * Ensures the settings sheet is fully closed — both the sheet body
 * AND the backdrop overlay. The backdrop (`v2-settings-overlay`) is a
 * sibling to the sheet and sometimes lingers after the sheet itself
 * unmounts; leaving it around intercepts clicks on the global
 * toolbar's Save button. Uses the explicit close X first, falls back
 * to Escape.
 */
export async function ensureSettingsSheetClosed(page: Page): Promise<void> {
  const sheet = page.locator('[data-testid="v2-settings-sheet"]');
  const backdrop = page.locator('[data-testid="v2-settings-overlay"]');
  const sheetVisible = await sheet.isVisible().catch(() => false);
  const backdropVisible = await backdrop.isVisible().catch(() => false);
  if (!sheetVisible && !backdropVisible) return;

  // Try the explicit close button — it fires the host's onClose which
  // tears down both the sheet and the backdrop atomically.
  const closeBtn = page.locator('[data-testid="v2-settings-close-btn"]');
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  } else {
    // Fallback: click the backdrop itself (mimics user click-outside),
    // then Escape for good measure.
    if (backdropVisible) {
      await backdrop.click({ force: true });
    }
    await page.keyboard.press('Escape');
  }

  await expect(sheet).toHaveCount(0);
  // Backdrop sometimes unmounts on the next tick — poll.
  await expect(backdrop).toHaveCount(0);
}

// ─── State probes ──────────────────────────────────────────────────

/**
 * Read every profile stored in the `marketsui-config` IndexedDB,
 * flattening across the bundled `appConfig` rows. Useful for asserting
 * on disk-level persistence independent of the UI state.
 *
 * Returns an array of `{ id, name, state, gridId }` rows. `state` is
 * the serialized module-state envelope map. The `gridId` field is the
 * snapshot's own `gridId` — handy for filtering by grid in
 * two-grid-isolation specs.
 *
 * Filters by demo-react's `(appId='demo-react', userId='demo-user')`
 * scope so other apps' rows (none today, but the helper is
 * future-proofed) don't show up.
 */
export async function readStoredProfiles(page: Page): Promise<Array<{ id: string; name: string; state: Record<string, unknown>; gridId: string }>> {
  return page.evaluate(async () => {
    return new Promise<Array<{ id: string; name: string; state: Record<string, unknown>; gridId: string }>>((resolve) => {
      const req = indexedDB.open('marketsui-config');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('appConfig')) { resolve([]); return; }
        const tx = db.transaction('appConfig', 'readonly');
        const rq = tx.objectStore('appConfig').getAll();
        rq.onsuccess = () => {
          const rows = (rq.result ?? []) as Array<{
            appId?: string;
            userId?: string;
            componentType?: string;
            payload?: { profiles?: Array<{ id: string; gridId: string; name: string; state: Record<string, unknown> }> };
          }>;
          const out: Array<{ id: string; name: string; state: Record<string, unknown>; gridId: string }> = [];
          for (const row of rows) {
            if (row.appId !== 'demo-react' || row.userId !== 'demo-user') continue;
            const arr = row.payload?.profiles;
            if (!Array.isArray(arr)) continue;
            for (const p of arr) {
              out.push({ id: p.id, gridId: p.gridId, name: p.name, state: p.state });
            }
          }
          resolve(out);
        };
        rq.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
  });
}

/** Return the currently-active profile id for a given gridId. */
export async function readActiveProfileId(page: Page, gridId = 'demo-blotter-v2'): Promise<string | null> {
  return page.evaluate((g) => localStorage.getItem(`gc-active-profile:${g}`), gridId);
}

/**
 * Read a specific module's state out of a stored profile row. Returns
 * the unwrapped `data` payload (strips the `{v, data}` envelope), or
 * `undefined` if the module isn't present.
 */
export async function readProfileModuleState<T = unknown>(
  page: Page,
  profileId: string,
  moduleId: string,
): Promise<T | undefined> {
  const profiles = await readStoredProfiles(page);
  const p = profiles.find((x) => x.id === profileId);
  if (!p) return undefined;
  const envelope = p.state?.[moduleId] as { v?: number; data?: T } | undefined;
  return envelope?.data;
}

// ─── DOM probes on the grid ────────────────────────────────────────

/**
 * Return `getComputedStyle(cell).fontWeight` for the first cell of the
 * given column id in the grid. Useful for asserting bold/etc. landed
 * on AG-Grid cells from a column-customization rule.
 */
export async function readCellFontWeight(page: Page, colId: string): Promise<string> {
  return page.evaluate((id) => {
    const cell = document.querySelector(`.ag-cell[col-id="${id}"]`) as HTMLElement | null;
    return cell ? getComputedStyle(cell).fontWeight : '';
  }, colId);
}

/** How many rows in the grid carry the conditional-styling rule class. */
export async function countRowsWithRuleClass(page: Page, ruleId: string): Promise<number> {
  return page.evaluate((id) => {
    return document.querySelectorAll(`.ag-row.ds-rule-${id}`).length;
  }, ruleId);
}

/**
 * Force AG-Grid to redraw all visible rows so cell/row-class rules are
 * re-evaluated. Used after profile switches where rowClassRules may
 * have changed but AG-Grid's cached per-row class set hasn't been
 * invalidated. Traverses React fibers to find the live GridApi.
 */
export async function forceGridRedraw(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return;
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (root as unknown as Record<string, unknown>)[fiberKey] as { return?: unknown; memoizedState?: unknown; stateNode?: { api?: unknown } } | null;
    for (let i = 0; i < 80 && fiber; i++) {
      const candidates: Array<{ redrawRows?: () => void }> = [];
      if (fiber.stateNode && typeof fiber.stateNode === 'object' && 'api' in fiber.stateNode) {
        candidates.push(fiber.stateNode.api as { redrawRows?: () => void });
      }
      const mem = fiber.memoizedState as { memoizedState?: { api?: unknown; current?: { api?: unknown } }; next?: unknown } | null;
      let s = mem;
      while (s) {
        const sm = s.memoizedState;
        if (sm && typeof sm === 'object') {
          if ('api' in sm) candidates.push(sm.api as { redrawRows?: () => void });
          if ('current' in sm && sm.current && typeof sm.current === 'object' && 'api' in sm.current) {
            candidates.push(sm.current.api as { redrawRows?: () => void });
          }
        }
        s = s.next as typeof mem;
      }
      for (const api of candidates) {
        if (api && typeof api.redrawRows === 'function') {
          api.redrawRows();
          return;
        }
      }
      fiber = (fiber as { return?: unknown }).return as typeof fiber;
    }
  });
  await page.waitForTimeout(200);
}

/** Check whether a calculated column rendered its header in AG-Grid. */
export async function calculatedColumnHeaderVisible(page: Page, colId: string): Promise<boolean> {
  return page.evaluate((id) => {
    return !!document.querySelector(`.ag-header-cell[col-id="${id}"]`);
  }, colId);
}

/**
 * Check whether a column-group header (shown as an ag-header-group-cell)
 * is rendered. AG-Grid's DOM uses `col-id` on the group cell too, keyed
 * off the group's stable id — BUT AG-Grid appends a numeric "_N" suffix
 * to disambiguate duplicate structures, so we match by prefix.
 */
export async function columnGroupHeaderVisible(page: Page, groupId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const cells = Array.from(document.querySelectorAll('.ag-header-group-cell'));
    return cells.some((c) => {
      const colId = c.getAttribute('col-id') ?? '';
      return colId === id || colId.startsWith(`${id}_`);
    });
  }, groupId);
}
