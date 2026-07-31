# Changelog — 2026-06-15 onward

Summary of features, improvements, and bug fixes landed in git **on or after 2026-06-15**.

| Date | Commit | Branch | Summary |
|------|--------|--------|---------|
| 2026-06-15 | `2ab25b07` | `test/openfin-linking` | OpenFin grid-to-grid color linking |
| 2026-06-15 | `176abdd5` | `test/openfin-linking` | Grid-link debug logging gated |
| 2026-06-15 | `78c2529e` | `main` | AG Grid 35 checkbox-less row selection |
| 2026-06-16 | `6d96cb08` | `feature/performance` | Idle provider teardown + streaming performance |

---

## Features

### OpenFin grid-to-grid linking (`2ab25b07`)

Branch: `test/openfin-linking`. See also [`OPENFIN_GRID_LINKING.md`](./OPENFIN_GRID_LINKING.md).

- Color-linked **MarketsGrid** instances share row selection across OpenFin views.
- Primary transport: **`fin.me.interop`** (`useInteropChannel`); FDC3 channel fallback outside OpenFin.
- **Field-based linking** — broadcasts key-column values from `getRowId` (auto-derived via `onRowIdFieldChange`, not hardcoded).
- Group selections expand to **leaf rows**; receivers apply only columns they own.
- **Echo suppression** per window source id so two instances of the same view do not drop each other's broadcasts.
- **OpenFin Notification Center** messages on send/receive (`useGridLinkNotifications`, gated by `contextLink.notify`).
- star-demo and docs wired up.

### Data provider lifecycle (`6d96cb08`)

Branch: `feature/performance`.

- **Idle auto-teardown** — upstream STOMP/REST/mock stops when the last data **and** stats subscriber leaves (`detach`, port close, dead-port prune, or missed heartbeats).
- **Subscriber heartbeats** — client ping every 15s; hub sweeps every 10s and evicts subs silent for >45s.
- **`pagehide` cleanup** — `SharedWorkerDataServicesClient.close()` detaches all subscriptions when a blotter window closes (non-bfcache).
- Hub introspect exposes per-subscriber `attachedAt`, `lastPingAt`, `stale`, and optional `meta.label`.

---

## Improvements

### Grid streaming performance (`6d96cb08`)

- **Incremental filter pill counts** — `useFilterCounts` adjusts via `RowChangeBus` deltas instead of a full-grid scan every tick.
- **`applyProviderToGrid`** — `markSnapshotLoaded` row-id index so live ticks avoid O(n) `getRowNode` lookups.
- **`useBlotterDataConnection`** — fewer React updates (no `setRowCount` on update-only ticks; snapshot flush parity with `useProviderDataWiring`).
- **`useProviderDataWiring`** — DEBUG-gated hot-path logging.
- **Conditional styling** — skip header paint when no header rules; early exit in `headerPainter`.
- **Grid defaults** — `animateRows: false`, `debounceVerticalScrollbar: true` for streaming-friendly grids.
- **`ProviderClientAdapter`** — `getData()` returns the last snapshot commit by reference (not copied, not updated on live ticks).

### Expression engine (`6d96cb08`)

- **Case-insensitive keywords** — `in`, `and`, `or`, etc. (e.g. `data.rating in ['BB', 'B']`).

### Tooling (`6d96cb08`)

- **`install-apps.mjs` / `propagate.mjs`** — purge stale `apps/package-lock.json` and `apps/node_modules/.package-lock.json` that break `file:libs/*.tgz` resolution (avoids `ETARGET` against registry.npmjs.org).

### OpenFin linking polish (`176abdd5`)

- Grid-link console diagnostics gated behind **`contextLink.debug`** (default off); genuine errors still log.

---

## Bug fixes

### AG Grid 35 row selection (`78c2529e`)

Branch: `main`.

- **Checkbox-less selection mode** — when the checkbox column is off, rows are click-selectable and the header “select all” checkbox is removed.
- Materializes correct **`RowSelectionOptions`** (`enableClickSelection`, no header checkbox).
- Tests added in `generalSettingsModule.test.ts`.

### Build / install reliability (`6d96cb08`)

- Stale apps lockfiles causing **`ETARGET`** / wrong registry resolution during `npm install` in the apps workspace.

### E2e alignment (`6d96cb08`)

- **`e2e/v2-general-settings.spec.ts`** updated for new `animateRows` default (`false`).

---

## Branch map

| Branch | Commits since 2026-06-15 |
|--------|----------------------------|
| **`main`** | Row selection fix (`78c2529e`) |
| **`feature/performance`** | Row selection fix ancestry + performance/lifecycle (`6d96cb08`) |
| **`test/openfin-linking`** | OpenFin linking + debug gating (`2ab25b07`, `176abdd5`) + row selection fix |

---

## Known follow-ups (not yet landed)

- Diagnostics tab **per-subscriber list** / instant subscriber count (today: ~1s stats tick; data subscribers only).
- `DiagnosticsTab.tsx` header comment still says providers “never auto-detach” — stale after idle teardown.
