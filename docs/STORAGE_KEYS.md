# Browser-storage key registry

Every localStorage / sessionStorage key or key-prefix written by code under
`packages/`. One row per key; **the "owner" file holds the only literal** —
new code imports the owner's builder/constant, never respells the string.
Update this table in the same change as any key addition/removal (same rule
as `current-features.md`).

Maintenance rule for renames: a key classed **durable** below must ship a
read-old-then-migrate path in the same change (precedent:
`applyTheme.ts`'s `@wellsfargo-starui/theme` blob migration — read the old
key only when the new one misses, delete old on next write). Sentinels and
caches may be renamed freely.

## Durable user state

| Key / prefix | Store | Owner (literal lives here) | Holds |
|---|---|---|---|
| `markets-grid-bundle:<gridId>` | local | `core/engine/src/persistence/LocalStorageBundleAdapter.ts` (`marketsGridLocalStorageBundleKey`) | The whole profile bundle: profiles[], activeProfileId, gridLevelData (one JSON doc) |
| `gc-active-profile:<gridId>` | local | `core/engine/src/persistence/StorageAdapter.ts` (`activeProfileKey`) | Per-grid active-profile pointer (see `docs/PROFILE_PERSISTENCE.md` for the 3-layer pointer model) |
| `starui:theme` | local | `types/shared-types/src/theme.ts` `THEME_STORAGE_KEY` (byte-equal twin in `types/types/src/index.ts`, pinned by `themeKeyParity.test.ts`) | `'dark' \| 'light'` |
| `starui:cvd` | local | `design-system/src/applyTheme.ts` | `'on'` or absent — colour-vision-deficiency toggle |
| `starui:variant` | local | `design-system/src/applyTheme.ts` | `'clinical' \| 'paper'` light-surface variant |
| `ds-recent-colors` | local | `react-grid/grid/src/customizer/ui/format-editor/FormatColorPicker.tsx` | Recent color swatches (max 10) |
| `@wellsfargo-starui/theme` | local | `design-system/src/applyTheme.ts` (`LEGACY_KEY`) | Legacy theme blob — read-once fallback, deleted on next write. Drop the fallback only after the migration window is declared closed |

## Sentinels & caches (droppable, unless noted)

| Key / prefix | Store | Owner | Purpose / caution |
|---|---|---|---|
| `starui:seed-digest:<seedUrl>` | local | `core/host-config/src/ConfigManager.ts` + `seedDigest.ts` | Last-applied seed hash. **Caution:** clearing it with `seedConfigReload: 'when-changed'` triggers a full `replaceAllWithSeed({clearFirst: true})` — treat as durable-by-consequence |
| `profile-migration-v1` | local | (helper deleted in the Phase-2 consolidation; flag inert in old browsers) | **Caution while any pre-consolidation build exists:** clearing it there re-copies rows from the surviving `gc-customizer-v2` Dexie DB, resurrecting deleted profiles |
| `starui:seed-identity:<url>` | local + session (dual-write) | `core/host-config/src/normalizeSeedData.ts` | Cached `{activeAppId, activeUserId}`; refetches if dropped |
| `starui:platform-warm:<appId>` | local + session | `data/host-data/src/bootstrap/platformWarmSession.ts` (via `crossWindowStorage.ts`) | Bootstrap-completed marker |
| `starui:appDataBootstrap:<appId>:<userId>:<hookId>` | session | `data/host-data/src/bootstrap/appDataBootstrap.ts` | Hook-already-ran sentinel |
| `starui-grid:last-focused-doc` | local | `react-grid/grid/src/widget/useRestoreCellFocusOnWindowFocus.ts` | Per-document token arbitrating cell-focus restore across same-origin views |
| `marketsui.tabsHidden` | session | `react-grid/widgets-react/src/hosted/useTabsHidden.ts` | Anti-flicker cache of the OpenFin tabs-hidden option |
| `hosted-mg.legacy-cleanup` | local | `react-grid/widgets-react/src/hosted/useHostedStarui.ts` | One-shot `marketsgrid-view-state::*` row cleanup sentinel |

## Non-storage collisions worth knowing

- `THEME_BROADCAST_CHANNEL` (BroadcastChannel name) shares the literal
  `'starui:theme'` with the storage key — intentional-but-unlovely; renaming
  the channel breaks cross-version window sync during rolling deploys
  (WORKLOG item 17).
- IndexedDB databases are outside this registry (`marketsui-config` via
  Dexie in `core/host-config/src/db.ts`; legacy `gc-customizer-v2` kept as a
  rollback source).

## Dead namespaces (no writer in `packages/`)

`gc-state:`, `ds-grid:`, and a bare `theme` key appear only in `apps/e2e`
cleanup filters (files in the WORKLOG item 1 broken class). Do not add
writers; remove the filter terms whenever those specs are rewritten.

## Delimiter note

Four styles coexist (`starui:` / `starui-grid:` / `marketsui.` /
`hosted-mg.` / bare). Renaming durable keys purely for consistency is
deliberately NOT done — it would force migrations for zero user value.
New keys use the `starui:` prefix with `:` delimiters.
