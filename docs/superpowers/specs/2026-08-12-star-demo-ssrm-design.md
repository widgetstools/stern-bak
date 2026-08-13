# star-demo-ssrm — design

**Date:** 2026-08-12
**Status:** approved, pending implementation plan

## Goal

Stand up an SSRM peer to `apps/source/star-demo`: the same OpenFin workspace
demo, driven by the server-side row model against the same STOMP feed, so the
two can run side by side and be compared directly.

star-demo is the only OpenFin + real-STOMP demo in the tree. The existing
`markets-grid-ssrm-lab` covers SSRM against `mock-ssrm` only, so the
real-STOMP-under-SSRM path has no demo today. That gap is the point of this
work.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Shape | New sibling app `apps/source/star-demo-ssrm` | Matches the `markets-grid-ssrm-lab` precedent; keeps star-demo as an untouched CSRM reference |
| Feed | `stomp-ssrm` only | Exact parity with star-demo; no new dependency |
| Colour linking | Exact CSRM parity, including group-select and select-all | Explicit requirement |
| Select-all payload | No cap — broadcast every key | Byte-for-byte CSRM behaviour; the scaling cliff is identical in CSRM today |

## Part 1 — the app

Clone of `star-demo` with three identity collisions broken:

| Collision | star-demo | star-demo-ssrm |
|---|---|---|
| Vite port | 5175 | 5176 |
| OpenFin platform uuid | `star-demo` | `star-demo-ssrm` |
| Manifest self-references | `localhost:5175` | `localhost:5176` |

Config-service REST (`localhost:3001`) stays shared. Distinct uuids mean both
platforms can run simultaneously in OpenFin.

`public/seed.json` changes one field:

```diff
-  "providerType": "stomp",
+  "providerType": "stomp-ssrm",
   "websocketUrl": "ws://localhost:8081",
   "keyColumn": "positionId"
```

No change to `stomp-view-server`: the registry dispatches `stomp` and
`stomp-ssrm` through the same `startStomp` factory
(`packages/data/host-data/src/runtime/providers/registry.ts:29`). Only the
worker differs, attaching an SSRM query plane.

`src/views/BlottersMarketsGrid.tsx` swaps `HostedMarketsGrid` →
`HostedSsrmMarketsGrid` and adds the required `providerId`. Every other prop
it passes today survives, conditional on Part 2.

`ConfigBrowser`, `DataProviders`, `RenameViewTab`, `starGridApp/`,
`platformBootstrap` and the popout plumbing are cloned unchanged — they
operate on the config catalog, which is row-model agnostic.

## Part 2 — platform: prop forwarding

`SsrmMarketsGridContainer` currently inherits a fixed slice of
`MarketsGridProps` (`storage`, `instanceId`, `appId`, `userId`, `host`, the
five `show*` flags, `theme`) and hardcodes `gridId={providerId}`
(`SsrmMarketsGridContainer.tsx:195`).

star-demo's blotter relies on six props the container drops. Add them to the
inherited `Pick` and forward them to `MarketsGrid`:

- `gridId` — currently forced to `providerId`; star-demo uses
  `star-demo-blotter`, and the value keys stored grid state
- `defaultColDef`
- `contextLink`
- `historicalDateAppDataRef`
- `onEditProvider`
- `onOpenConfigBrowser`

`MarketsGrid` already accepts all six. This is forwarding, not new mechanism.

## Part 3 — platform: colour-linking parity

The requirement is that linking behaves exactly as it does under CSRM.

### Already identical — no work

The receive path. `defaultGridLinkResolver` builds a set-filter model,
`applyGridLinkContext` merges it with the user's manual filters, and
`setFilterModel` re-queries. The worker supports `filterType: 'set'`
(`packages/data/host-data/src/runtime/ssrm/filter.ts:158`). The merge logic
that tracks `prevLinkFields` is pure client-side and unaffected.

### Gap 1 — group-row selection

`buildSelectionContext` expands a selected group through
`node.allLeafChildren`. Its own comment records the problem: *"empty under
SSRM where descendants aren't loaded, in which case the group simply
contributes nothing."* CSRM broadcasts every leaf key; SSRM broadcasts
nothing.

**Fix.** Fetch the distinct key-column values for the group path from the
worker. `QueryEngine.getSetFilterValues` already scopes by filter model and
quick filter; extend its request with `groupKeys` + `rowGroupCols` so it can
also scope to a group path, and thread that through the
`ssrm-set-filter-values` RPC.

`GridLinkSelectionBuilder` gains an awaitable return
(`Context | null | Promise<Context | null>`); existing sync builders keep
working under `await`. The publish effect in `useGridContextLink` awaits the
builder behind a sequence guard, so a slow round-trip cannot broadcast over a
newer selection.

### Gap 2 — select-all

AG Grid 36 docs, `onSelectionChanged`: *"When using the SSRM, `selectedNodes`
will be `null` when selecting all nodes. Instead, refer to the
`serverSideState` field."* State arrives as
`ServerSideRowSelectionState { selectAll, toggledNodes }`.

**Fix.** On `selectAll`, request the distinct key values for the current query
with no `groupKeys`, then subtract `toggledNodes`. Broadcast the full set —
no cap, matching CSRM exactly.

### Gap 3 — `mode: 'rowId'`

`applyRowIdExternalFilter` installs `doesExternalFilterPass`, which SSRM never
invokes.

**Fix.** Under SSRM, translate the broadcast row ids into a set-filter model
on the key column and route it through `applyGridLinkContext`, so it merges
with manual filters the same way the `fields` path does.

star-demo uses `mode: 'fields'`, so this gap is not on its critical path; it
is included because the parity requirement is unqualified.

### Where the code lands

The SSRM-aware selection builder is supplied by `SsrmMarketsGridContainer`
via the existing `config.buildContext` seam, so `useGridContextLink` gains
only the awaitable contract. Nothing here is star-demo-specific — every SSRM
grid inherits it.

## Build order

The parts are listed in dependency order, not effort order. Part 3 is the
bulk of the work and Part 1 is largely mechanical, but the app delivers no
parity until the platform work lands, so:

1. **Part 3** — linking parity (worker RPC, awaitable builder, three gaps).
   Independently testable in `packages/`, no app required.
2. **Part 2** — prop forwarding. Small, and unblocks the blotter view.
3. **Part 1** — clone the app and flip the feed.

Each part is shippable on its own: 3 and 2 improve every SSRM grid whether or
not the new app is ever built.

## Testing

Unit, in `packages/`:

- The six forwarded props: written against the current container first, so
  they fail on the dropped props before the change.
- Group-scoped set-filter values in `QueryEngine` — including a group whose
  leaves are not loaded, which is the case that motivates the RPC.
- The SSRM selection builder: leaf selection, group selection, `selectAll`,
  `selectAll` with `toggledNodes`, and the sequence guard discarding a stale
  round-trip.
- `mode: 'rowId'` producing a key-column set-filter model.

App tests in `apps/source/star-demo-ssrm`: adapt star-demo's 22 test files
rather than copy them — identity, ports and the provider type all change, and
a test asserting `providerType: 'stomp'` should assert `'stomp-ssrm'`.
`markets-grid-ssrm-lab` carries 20 files, so this is the established weight.

No new e2e. `apps/e2e/ssrm-viewport-ticks.spec.ts` already covers the SSRM
data path, and star-demo's OpenFin surface has no e2e coverage today —
adding it is a separate piece of work.

## Non-goals

- Making `ConfigBrowser` or `DataProviders` SSRM-aware; they are catalog
  tools and row-model agnostic.
- e2e coverage of the OpenFin workspace surface.
- Deduplicating star-demo and star-demo-ssrm. The sibling-app shape means
  ~2,500 LOC is duplicated and the two will drift. This is inherent to the
  chosen shape and matches the SSRM lab precedent.
- Addressing the broadcast-size cliff on select-all. It is identical in CSRM;
  fixing it is a change to both models, not to this app.

## Risks

| Risk | Mitigation |
|---|---|
| Awaitable builder changes a shared hook used by CSRM grids | Sync builders still satisfy the type and work under `await`; CSRM path keeps a synchronous builder, so its behaviour is unchanged. Cover with a CSRM regression test. |
| Sequence guard is easy to get subtly wrong | Test explicitly that a stale resolution is discarded rather than broadcast. |
| Group set-filter-values RPC could be slow on wide groups | Today `getSetFilterValues` scans the whole row map via `getUniqueValuesFiltered`. The group-scoped variant should instead be built on `collectFilteredCached`, reusing the memoised filtered set the block query already paid for — faster, and consistent with what the grid is displaying. |
| Two apps drift | Accepted and recorded above. |
