# Simplification roadmap — execution record

**Branch:** `feature/simplify` (off `feature/ssrm`). **Status: Phases 0–6
complete (39 commits + doc commits); Phase 7 remains.** All commits
local/unpushed unless the log says otherwise.

The originating review found a ~130k-LOC framework whose irreducible
feature set (AG Grid + live data feeds + no-code customization + saved
configs) justified maybe 30–40k: five public grid components, 2,036
exported symbols, a 15-concept identity soup, three naming generations,
17-hop data paths, and roughly half the code being scaffolding
indistinguishable from architecture. The full review + original phase
plan lives at `~/.claude/plans/declarative-sniffing-reef.md` (outside
the repo); this document is the in-repo record of what was actually
done, what deviated from the plan's letter and why, and what remains.

## Binding constraints (they override plan text)

1. **No loss of features, functionality, or behavior.** Only
   provably-zero-consumer or provably-broken code is deleted. Persisted
   user state always keeps loading (normalize-on-read over migrations,
   migrations over breakage).
2. Where the plan's letter conflicted with constraint 1, the honest
   version was implemented and the deviation recorded in the commit
   message. The **Deviations ledger** below indexes them.
3. OpenFin flows (workspace save/restore, dock, popouts, interop
   linking) cannot be e2e'd headlessly in this environment — their
   seams (`onWorkspaceSave`, `contextLink`) stay stable and changes near
   them ship with a manual-validation note.

## Working method (proven; keep using it)

- **Survey first.** Parallel Explore subagents map the ground with
  file:line evidence before any design. The audit's claims were wrong in
  detail often enough (a "v1→v10 migration ladder" that doesn't exist,
  "back-compat" maps that never worked, a "16-entry" map that was 18
  entries of dead code) that no count or consumer list is trusted
  unverified.
- **Chunk into independently shippable commits.** Per chunk:
  `npx turbo typecheck build test` with the exit code captured directly
  (`echo "TURBO_EXIT=$?"` — piping turbo through grep has masked
  failures), the SSRM e2e battery, app typechecks, then a conventional
  commit updating `docs/current-features.md` in the same change.
- **Baseline before blame.** Any failure gets a stash → rebuild →
  re-run before being attributed to the change at hand. This caught
  three would-be false regressions (WORKLOG items 1 and 16, and
  star-demo's empty first-run blotter).
- E2E battery: `apps/e2e/star-demo-ssrm-smoke.spec.ts`,
  `ssrm-viewport-ticks.spec.ts`, `hello-blotter.spec.ts` (7 tests;
  self-skip when stomp-view-server :8081 is down). Apps consume built
  dist — `npm run build:packages` before browser verification.

---

## Phase 0 — dead-weight deletion ✅ (8 commits, −9,115 LOC)

`82a581f` `e7083b2` `74ac18b` `396b5a4` `46a0918` `c798918` `a22efcc` `b7274a8`

Deleted with per-symbol verification: the blotter DI cluster,
`host-wrapper-react`, `widget-sdk` + `core/widget` + `widget-browser`,
`host-data-angular`, deprecated `SsrmMarketsGrid` + unused `SsrmAgGrid`,
the dead `dataProviderConfigService`, the fictional
`websocket`/`socketio` provider surfaces, reserved reconnect fields and
`AppDataVariable.durability`, the openfin `plugin` subpath and disarmed
workspace GC, the deprecated per-segment toolbar props, `MINIMAL_MODULES`,
~dead export subpaths, and the three provably wrong consumer guides.
Home/Store workspace components became opt-in (every consumer disabled
them). Consumer tsconfig mappings 92 → 69.

Deviations: `GridColorPickerPopover`'s file kept (exports load-bearing
`ColorPicker`); `toolbar-visibility` and `saved-filters` micro-modules
kept (audit called them near-dead; both have live write paths).

## Phase 1 — one front door ✅ (5 commits)

`45ae557` `a7e1da2` `caa0a3a` `797e6bf` `26a642f`

- `createStarui({appId, userId, providers, storage})` — one-call
  bootstrap: platform boot, create-if-missing provider seeding
  (deterministic providerIds), storage factory, identity context.
- `<StarGrid>` — the one grid component. Mode inferred, never chosen:
  named provider → CSRM/SSRM by `isSsrmProviderType`; `rowData` →
  static; neither → CSRM container with runtime provider selection.
  Hosting is built in (document title, workspace-save + teardown
  `saveAll()` flush, mode-aware `contextLink`, `[data-theme]`-reactive
  theme, full-bleed frame).
- North star: `apps/source/hello-blotter` — live 20k-row SSRM blotter in
  27 lines / 2 starui import specifiers, e2e-guarded
  (`apps/e2e/hello-blotter.spec.ts`).
- All demo blotters (star-demo, star-demo-ssrm, stomp-marketsgrid-minimal,
  dataprovider-editor panels) migrated; **both hosted wrappers deleted**;
  `StaruiIdentityProvider` + `useHostedStarui` bridge custom bootstraps
  and workspace hosts (per-view id via `advanced.instanceId` keeps
  restored-workspace persistence byte-identical). Dev identity
  (`'TestApp'`/`'dev1'`) gated behind explicit `devDefaults: true`.
- Real bugs fixed en route: SSRM containers rendered headerless grids
  for providers without `columnDefinitions` (now inferred from a sampled
  block), and the snapshot's rows-received setState burst tripped
  React's nested-update ceiling and could kill the app root
  (now coalesced ~100ms).

## Phase 2 — one persistence story ✅ (5 commits)

`227a515` `ae28c44` `14714ea` `fc592f0` `90bcfc7`

- One profile surface: `ConfigPort`/`createConfigPort` deleted
  (subscribe-only façade, zero consumers), `ConfigManager.profiles`
  namespace deleted (only live member became
  `ConfigManager.onRowChanged(configId, fn)`; its writes had no OCC
  retry), never-called legacy Dexie migration deleted.
- One adapter instance per row: both storage factories memoize per row
  identity — the intra-window dual-writer hazard (container
  gridLevelData writer vs controller profile writer with split version
  caches; historical silent-write-loss bug) is structurally impossible;
  the OCC retry remains as the cross-window belt.
- Real bug fixed: `ProfileManager.import()` never wrote the OpenFin
  customData pointer, so workspace restore reverted imported profiles.
- Theme key single-sourced (parity test pins the two subpath
  declarations; hardcoded literal and a booby-trapped legacy fallback
  removed). `docs/STORAGE_KEYS.md` is the browser-storage registry.

Deviations: the active-profile pointer stays LAYERED (customData is
per-view — two views of one grid holding different profiles is a
feature; collapsing to one location would delete it). Durable storage
keys keep their names (renames force migrations for zero user value;
the hazard was literal drift, now guarded).

## Phase 3 — honest provider configs ✅ (5 commits)

`2fdd9a5` `c202943` `f2de5a4` `a0a11cd` `74fffdd`

- `validateProviderConfig` given teeth (rules mirror what transports
  require at attach) and wired into the editor's save + JSON-import
  paths. Real bug fixed: the hub's restart-with-cfg branch threw
  uncaught in the worker on a bad config — the editor's
  Restart-after-edit path hung the client in 'loading' forever.
- Honest Stomp config: six dead fields deleted (~24% of the type),
  `STOMP_TUNING_DEFAULTS` single-sources the effective runtime defaults.
  Editor defects fixed: the Behaviour tab lied ("throttle 0 / JSON
  (default)" vs actual 25ms/columnar), selecting "JSON (default)" wrote
  `undefined` which the hub RUNS AS COLUMNAR (JSON was unselectable),
  and all nine tuning knobs were unreachable for stomp-ssrm providers.
  `publishWindowMs` gained an editor control.
- One discriminator: `isSsrmProviderType` canonical in
  `@wellsfargo-starui/types`; the last inline `-ssrm` string test
  (StarGrid) routed through it; the dead componentSubType maps deleted.
- `getConfigOrNull()` on both provider interfaces — 8 try/catch config
  probes became null reads (killing a swallowed-throw path that baked
  `cacheBlockSize: 100` into an init-only AG Grid option);
  `resolveSsrmKeyColumn` is the one SSRM keyColumn algorithm;
  `SSRM_COMPOSITE_KEY_FIELD` exported instead of respelled; the
  `'positionId'`-vs-`'id'` split-default trap closed.
- `ProviderConfig` → `TransportConfig` (41 files, word-boundary rename,
  deprecated alias kept one release). SSRM status text unified ('Live').

Deviations: the `{connection, tuning}` config nesting was REJECTED
(~10 structural-cast readers would silently type-check and return
`undefined` — a silent-failure class); grouped banners + the defaults
table deliver the intent. The `mode: 'csrm'|'ssrm'` field was REJECTED
(~37 files + seed-digest re-seeds + user-exported JSON normalization
forever, vs an actual mess of one suffix check and two dead maps).

## Phase 4 — barrel diet + naming ✅ (4 commits)

`e2a65a6` `e64a6a9` `482d27f` `e0dfdd4`

- Modules live in `core/engine` only: the 18 one-line `export *` shims
  deleted (49 importers repointed; guaranteed type-equivalent since each
  shim re-exported the whole core barrel), five duplicated test files
  consolidated engine-side with no coverage lost.
- Type seams: `SerializedState` moved to types; ONE `ProfileSnapshot`
  shared by StorageAdapter and StoragePort — both `as unknown as`
  storage casts became plain returns. `MarketsGridHandle<TData = any>`
  generic (six consumer casts dropped). `MarketsGridSsrmProps` +
  `isMarketsGridSsrmMode` exported.
- Barrel diet: `grid/customizer` 320 → 14 curated names (full former
  surface in unexported `customizer/internal.ts` for in-package use);
  five zero-importer subpaths cut (`react ./data`,
  `data ./runtime/sharedWorker`, `design-system ./primeng`/`./shadcn`,
  `grid ./widgets/markets-grid-container` — surface joined `./widgets`);
  `data ./ssrm-engine` kept deliberately. Collisions resolved: dual
  `useAgGridTheme` (hosted variant is THE public one), dead types-side
  `ProviderCapabilities`/`ProviderTestResult` deleted.
- Naming vocabulary is binding (see `current-features.md`): **StarGrid
  is the consumer-facing family; MarketsGrid is internal.**

Deviations: the repo-wide MarketsGrid→StarGrid rename was rejected
(thousands of occurrences for a word consumers never type). The ≤400
total-symbol exit criterion is PARTIALLY met — the customizer cut was
the biggest win; further curation of core's 392-slot barrel belongs
with Phase 6's module consolidation. Survey counts (checker-verified,
pre-Phase-4): 2,307 slots / 1,729 names / 55 subpaths.

---

## Phase 5 — OpenFin containment ✅ (5 commits; ran in its own session)

`e3316c8` `f77618d` `731453b` `1d9081a` `954a832`

- **One `isOpenFin()`** (bare presence check, pinned by test). The
  survey found 13 named predicates + 7 inline guards (plan said 4); all
  private detectors outside `packages/openfin` deleted, both ambient
  `declare global fin` shims (with CONFLICTING types for the same
  global) and all 10 `declare const fin` lines outside openfin gone.
  Named seams on `@wellsfargo-starui/openfin/host` (getFinMe, IAB
  publish/subscribe/connect, interop client, platform view/window
  control — all no-op outside OpenFin, each tested); 17 files migrated.
  Dead hosted `useIab` + `useOpenFinChannel` deleted (~494 LOC, zero
  consumers — the plan's "four link transports" were two live + these
  two dead).
- **One URL-window opener**: `openOpenFinPopout` public;
  `openChildToolWindow` a thin wrapper (manifest-origin cache +
  inspectable menu); the divergent inline `open-config-browser`
  createWindow copy deleted (adopts dock-handler semantics: navigates
  stale-URL windows, inspectable menu). NEW `core/host` `toolSurfaces`
  (provider-editor / config-browser openers over
  `RuntimePort.openSurface`) replaces two md5-identical app copies +
  two inline blocks. PopoutPortal/Poppable deliberately NOT folded —
  DOM-reparenting popouts are a different mechanism (state preserved)
  and the only e2e-covered path.
- **One linking facade**: `GridLinkTransport` `{current,
  addContextListener, broadcast}` — the 3 members the hook uses
  (join/leave excluded; the consumer never called them).
  `GridContextLinkConfig` → `{enabled?, mode?, advanced?}` (evidence:
  every live consumer set exactly `{enabled, mode}`); enabled-but-no-
  transport now logs a loud error naming the fix; the demo manifests'
  false "$comment-fdc3" claim corrected (interop is primary; the flag
  only enables the fallback). Wire format untouched (rolling-deploy
  safe).
- **`initWorkspace` split**: `ensureConfigService` (with
  `'require-prewired'` mode that throws instead of silently
  constructing) + `runPlatformScopeMigrations`, both exported;
  `customActions` option now genuinely merged (was documented but never
  read); dead `roles` threading deleted; dead
  open-dock-editor/open-registry-editor/import-config actions + the
  ImportConfig window deleted (14 built-ins → 11); devtools menu
  entries gate on dev bundles (`WorkspaceConfig.devTools` forces).
- **One theme writer** (closes WORKLOG item 17): every `setTheme` —
  runtimes, dock toggle, workspace, inbound broadcast handlers — routes
  through `applyTheme` via a new `design-system ./apply-theme` subpath;
  a toggle no longer wipes the persisted cvd/variant choice, and the
  dock/workspace writers gain the `data-ag-theme-mode` attribute they
  wrongly omitted. New dependency edge core → design-system (downward
  onto a foundation package, permitted by the layer rules).

Deviations: containment via function seams on `openfin/host` instead of
widening `RuntimePort` (the port is prop-injected with one call site;
widening it would force host-context plumbing through every hosted hook
for zero consumer benefit); `initWorkspace`'s migrations default stays
ON (flipping it off would break the persisted-state healing existing
installs depend on — the "defaults minimal" plan text applies to the
new callable pieces); PopoutPortal kept as the second, genuinely
different popout mechanism.

Carries a manual-OpenFin-validation backlog (aggregated from the commit
messages): dock theme toggle preserves variant/cvd + recolors icons;
workspace save/restore unaffected; dock Tools menu devtools gating
dev-vs-prod and Import Config absence; tool-window open-or-focus +
navigate-on-stale-URL + Inspect; two dock-linked blotters exchange
selections (fields mode incl. SSRM group select-all) and the
no-transport error appears when linking is enabled without
interop/fdc3.

## Phase 6 — customizer consolidation ✅ (7 commits)

`e1f14a2` `e1fa551` `39a6aab` `2585845` `de67fb7` `fd23def` `c43d60f`

- **One `editing` module** (`e1f14a2`): smart-edit + bulk-update +
  plus-minus + shortcuts → one module id / persisted envelope / settings
  panel (four section tabs) / keyboard runtime (`activateEditing`
  arbitrates +/- ownership and letter shortcuts). Constraint-1 seam: new
  `Module.legacyIds` + `migrateLegacy` on `GridPlatform.deserializeAll`
  assembles `EditingState` from pre-merge snapshots' four legacy
  envelopes; version-TOLERANT — the old path DROPPED smart-edit
  envelopes stamped `v:1` by the lab profile kit (module was v2, no
  `migrate`), a real state-loss bug fixed, not preserved. e2e helpers
  resolve the legacy ids to section tabs; `navigateToModule` hardened
  against the settings-sheet slide-in / menu-animation races that made
  two specs flake under parallel-worker load. The v2-bulk-update
  distinct-value spec was red BEFORE the merge (stash-verified: the
  active seed profile sets `showDistinctValues: false`); it now loads
  the profile built for the dropdown.
- **Editing-toolbar allow collapse + prop diet** (`e1fa551`): the
  4-field `EditingToolbarAllow` struct was structurally dead since
  Phase 0 — collapsed to `useEditingToolbarVisible(showEditingToolbar)`
  (host tri-state; `undefined` defers to module switches).
  `showColumnSelector` + `showToolbarDatePicker` deleted (10 → 8 `show*`
  props; both defaulted true with zero setters anywhere — rendered
  behavior identical for every consumer).
- **Module-authoring contract** (`39a6aab`): `defineModule` defaults
  schemaVersion/priority/getInitialState/serialize/deserialize AND
  `migrate` (additive spread — a version bump can no longer silently
  drop state); `Module.category` replaces the menubar's id-list map
  (settings nav buckets by the module's own field); dead `code` field
  deleted (zero runtime consumers). "Add a toggle" now touches 4 files.
- **UI kit** (`2585845`): dead components deleted with per-symbol
  verification (icons.tsx, ItemCard, PanelChrome, TabStrip, the bare
  `ColorPicker` shell — dead since Phase 0's check that kept its file —
  and the `DirtyDot` BC alias); `PortalContainer` pure re-export
  collapsed onto `@wellsfargo-starui/react`; files renamed to their
  primary exports (`LedBar.tsx`, `ColorPickerPopover.tsx`).
- **Tool surfaces** (`de67fb7`): config-browser's private DynamicIcon
  fork deleted (9 unique Lucide keys merged into the design-system map;
  one-line re-export keeps its 8 importers untouched); its two
  hand-baked AG themes replaced by ONE `staruiGridTheme.withParams(tool
  overrides)` switched by the `data-ag-theme-mode` attribute it already
  writes; provider editor's registrar fork deleted —
  `ensureAgGridModules` now public on the grid barrel (fork had omitted
  the set-filter validate guard). Browser-verified on star-demo.
- **One write-surface for column styling** (`fd23def`): survey PROVED
  the formatting toolbar already writes the same
  `column-customization` state (same store key/type/field paths — no
  parallel copy); the ownership matrix in `current-features.md` is now
  the single reference (authority = Column Settings; every writer's
  fields; ColumnsTab's lower-precedence base-colDef layer; the
  deliberate divergences). Dead `clearAllBordersReducer` deleted.
- **Barrel curation + re-count** (`c43d60f`): core `.` 400 → 289 names
  (111 zero-external-importer names dropped; 7 API-companion types
  kept; d.ts references of other packages verified clean). Totals
  (checker-verified, same tool as Phase 4's baseline):
  **45 subpaths / 1,831 slots / 1,439 names** vs pre-Phase-4
  55 / 2,307 / 1,729. The ≤400 TOTAL goal is **not reachable without
  deleting consumed, documented API** — the remaining bulk is real
  consumed surface (react `.` shadcn set 253, data 155+94,
  design-system icon components 139, core `.` 289 now all externally
  consumed) — recorded here instead of forced.

Manual-validation note: config-browser + provider editor render checks
were done in a browser (star-demo routes); an OpenFin dock-opened
config-browser window deserves one eyeball pass on the new theme.

## Phase 7 — docs ⬜

One getting-started ending in live data (hello-blotter), one
architecture page, provider-config reference generated from the types,
an AppData page, an OpenFin page. Delete every doc referencing
nonexistent packages.

---

## Deviations ledger (plan letter → what shipped, and why)

| Phase | Plan said | Shipped instead | Why |
|---|---|---|---|
| 0 | delete `GridColorPickerPopover`, `toolbar-visibility`, `saved-filters` | kept | live consumers / write paths found on per-symbol verification |
| 2 | unify active-profile pointer to one location | writer-symmetry fix; layers kept | per-view customData divergence is a feature restored workspaces depend on |
| 2 | consolidate the 7 storage namespaces | registry doc + drift guards; no renames | renames force migrations for zero user value |
| 3 | `{connection, tuning}` config split | dead-field deletion + defaults table + banners | ~10 structural-cast readers would fail silently |
| 3 | `mode: 'csrm'\|'ssrm'` field | canonical `isSsrmProviderType` | 37-file + persisted-data blast radius vs a one-helper actual problem |
| 4 | rename MarketsGrid or StarGrid everywhere | StarGrid public / MarketsGrid internal (binding vocabulary) | consumers never type the internal name; churn without benefit |
| 5 | leaked call sites go through `RuntimePort` | function seams on `openfin/host` | the port is prop-injected with one call site; widening it plumbs host context through every hosted hook for nothing |
| 5 | initWorkspace pieces default minimal | migrations default stays ON | flipping it off breaks the persisted-state healing existing installs depend on |
| 5 | one popout mechanism | URL-window family unified; PopoutPortal kept | DOM-reparenting popouts are a different mechanism (state preserved) and the only e2e-covered path |
| 6 | customizer/ui 8.5k LOC → ~4k; replace duplicates with react primitives | dead files/exports deleted; wrappers kept | the audit's "gc-themed shadcn copy" NEVER EXISTED (git-history-verified); every primitive already comes from `@wellsfargo-starui/react` — the wrappers add styling/legacy APIs, not duplication |
| 6 | 4 color pickers → 1; 3 formatter pickers → 1 | dead `ColorPicker` shell deleted; the rest kept | ground truth: ONE engine (`FormatColorPicker`) behind role-distinct shells (toolbar popover vs alpha-carrying compact field); `FormatterPicker` is already one entry with compact/inline presentations; `FormatSection` is a narrow styling-band control with a different API |
| 6 | MarketsGridProps keeps ~4 coarse show* props | 10 → 8 (two zero-consumer props deleted) | the remaining 8 have live lab/demo consumers; "one mechanism" via general-settings would be a NEW persisted feature — general-settings has no toolbar-visibility mechanism (the `toolbar-visibility` module only stores filter-pill expansion) |
| 6 | ColumnsTab loses styling authority | UI already authors names/types/valueGetter only; JSON-import styling fields kept | removing the import back door breaks existing exported provider configs (constraint 1); precedence documented in the ownership matrix |
| 6 | tools reuse the shared grid MOUNT | registrar + theme + icons unified; purpose-built AgGridReact mounts kept | `MarketsGridSurface` lacks pass-through for the editors' core interactions (rowDrag, singleClickEdit, getRowId, cell-change hooks) and `MarketsGridCore` drags a GridPlatform per embedded table; config-browser's narrow module registration is a documented perf decision |
| 6 | ≤400 total public symbols | 1,831 slots / 1,439 names recorded | the remainder is consumed, documented API (shadcn set, icon components, data runtime); deleting it breaks external consumers for a number's sake |

## Known-broken, tracked, not chased

- WORKLOG item 1 — ~34 `v2-*` e2e specs target the deleted demo-react
  app at baseURL `/`; fail on boot, before and after every phase.
- WORKLOG item 16 — `v2-column-value-getter` grid-compute case
  (pre-existing, stash-verified).
