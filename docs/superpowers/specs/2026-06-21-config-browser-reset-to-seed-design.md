# Config Browser — "Reset to seed" (backup-gated)

**Date:** 2026-06-21
**Status:** Approved

## Goal

Add a Config Browser action that wipes **all** config tables and re-seeds them
from the runtime seed file (`ConfigManager.seedConfigUrl`, e.g. `/seed.json`),
gated by a **forced full-database backup download**.

## Decisions

- **Gate:** backup-only. Force a full backup download, then a single Reset click
  (no type-to-confirm).
- **Backup scope:** full database (all tables) — the bundle produced by the
  hook's `exportAll()`, which round-trips via Import and matches the seed.json
  shape.
- **Reset scope:** all config tables (`appConfig`, `appRegistry`, `userProfile`,
  `roles`, `permissions`).
- **Seed source:** the runtime `seedConfigUrl` the `ConfigManager` was
  constructed with (per-app). When none is configured, the button is disabled.
- **Layer:** built into shared `@wellsfargo-starui/config-browser` + `ConfigManager`, so
  every app mounting the Config Browser gets it.

## Changes

### 1. `ConfigManager` (`@wellsfargo-starui/host-config`)
- Extract the existing inline bulkPut-from-seed transaction (in
  `seedIfEmptyLocked`) into a private `replaceAllWithSeed(seedData)` that
  **clears all tables and bulkPuts in one `rw` transaction**, returning per-table
  counts. Reuse `clearSeedTables()`'s table set.
- New public `async resetToSeed(): Promise<ResetToSeedResult>`:
  1. Throw if `disposed` or no `seedConfigUrl`.
  2. **Fetch + parse + normalize the seed FIRST** (`parseSeedJson` /
     `normalizeSeedData`). A failed fetch/parse throws **before** any wipe — the
     DB is never left empty.
  3. Under the existing seed Web-Lock, run `replaceAllWithSeed(seedData)`.
  4. Update the seed digest + flush `rowCache`.
  5. Return `{ seedUrl, counts }`.
- Add `getSeedConfigUrl(): string | undefined` accessor for UI enablement.
- `ResetToSeedResult` exported from the package.

### 2. `useConfigBrowser` hook
- `resetToSeed(): Promise<ResetToSeedResult>` → calls the manager, then refreshes
  counts + current rows.
- Expose `seedConfigUrl: string | null` (from `getSeedConfigUrl()`).

### 3. New `ResetToSeedDialog` (mirrors `DeleteAllDialog`, backup-only)
- Warns it replaces **all** config from the seed; cannot be undone; names the
  seed URL.
- **Step 1 — Download backup (forced):** reuses the panel's full-bundle export;
  sets `backedUp`.
- **Reset** button disabled until `backedUp`; on click → `resetToSeed()`.
- Design-system tokens only (`--de-*` / `--ds-*`), matching the other dialogs.

### 4. `Toolbar`
- "Reset to seed" icon button (`lucide:database-backup`) in the destructive
  cluster; disabled with a tooltip when no seed is configured.

### 5. `ConfigBrowserPanel`
- `resetToSeedOpen` state; render the dialog; wire backup (existing export) +
  confirm (`resetToSeed` → refresh + close).

## Error handling
- No `seedConfigUrl` → button disabled (tooltip).
- Fetch/parse failure → `resetToSeed` throws before clearing; surfaced to the
  user; DB untouched.

## Testing
- `ConfigManager.resetToSeed` unit test: seed → mutate → `resetToSeed()` → tables
  match seed; a fetch failure aborts without clearing existing rows.
- Update `docs/current-features.md`.
