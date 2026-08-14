# Simplification roadmap — execution record

**Branch:** `feature/simplify` (off `feature/ssrm`). **Status: Phases 0–4
complete (27 commits); Phases 5–7 remain.** All commits local/unpushed
unless the log says otherwise.

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

## Phase 5 — OpenFin containment ⬜ (next)

From the plan: one `isOpenFin()` predicate (`declare const fin` only
inside `packages/openfin`; outside-references drop ~120 → <20 via
`RuntimePort`); one popout mechanism (PopoutPortal + injected opener;
`popout.ts`/`openChildToolWindow`/app-level helpers collapse); one
linking facade (interop primary, FDC3/IAB/Channel behind one adapter;
`contextLink` shrinks to `{enabled, mode}` + advanced; `fdc3InteropApi`
manifest requirement validated loudly at init); `initWorkspace` splits
into opt-in registration / seeding / migrations with customActions
opt-in and devtools dev-gated. WORKLOG item 17 (theme writers bypassing
`applyTheme`) is assigned here. Note: link wiring now lives in StarGrid +
`useGridContextLink`; the hosted wrappers no longer exist.

## Phase 6 — customizer consolidation ⬜

Merge the numeric-edit module family (smart-edit + bulk-update +
shortcuts + plus-minus → one editing module; they already share
`applyNumericOp`/`buildPatchesFromTargets`), one write-surface for
column styling (Column Settings is authority), one UI kit
(customizer/ui 8.5k LOC → ~4k using `@wellsfargo-starui/react`
primitives; 4 color pickers → 1), slimmer module-authoring contract,
provider-editor/config-browser reuse of the shared grid mount. Persisted
module state changes ship `migrate()` paths. Re-count the public symbol
surface here against the ≤400 goal.

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

## Known-broken, tracked, not chased

- WORKLOG item 1 — ~34 `v2-*` e2e specs target the deleted demo-react
  app at baseURL `/`; fail on boot, before and after every phase.
- WORKLOG item 16 — `v2-column-value-getter` grid-compute case
  (pre-existing, stash-verified).
- WORKLOG item 17 — theme writers bypass `applyTheme` (assigned to
  Phase 5).
