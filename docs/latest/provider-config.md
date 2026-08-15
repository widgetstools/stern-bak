# Provider Config Reference

> **Generated from the types** — field tables are extracted from
> [`packages/types/shared-types/src/dataProvider.ts`](../../packages/types/shared-types/src/dataProvider.ts)
> by `scripts/gen-provider-config-reference.mjs`. Edit the type doc
> comments (or this script's prose), then re-run
> `node scripts/gen-provider-config-reference.mjs`.

A **data provider** is a persisted catalog row that tells the SharedWorker
data hub how to reach a data source. The row wrapper is
`DataProviderConfig`; its `config` field is a `TransportConfig` — a
**discriminated union over `providerType`** with six variants. There is no
base transport interface; each variant is complete on its own (the two SSRM
variants extend their streaming siblings).

Ways a row gets created:

- `createStarui({ providers })` — create-if-missing seeding (deterministic
  `providerId` required; later editor edits survive reloads).
- The **Data Provider Editor** (`npm run app -- dataprovider-editor`, or the
  in-grid dialog) — validates on save with `validateProviderConfig`.
- A **deploy seed** (`seed.json`) — see [Seed formats](#seed-formats).

## Provider types

| `providerType` | Row model | What it is |
|---|---|---|
| `stomp` | CSRM | STOMP-over-WebSocket streaming: snapshot then live deltas, whole dataset to the client |
| `stomp-ssrm` | SSRM | same wire, plus the SharedWorker attaches a server-side-row-model query plane — grids page blocks |
| `rest` | CSRM | one-shot HTTP fetch — no live updates |
| `mock` | CSRM | synthetic rows with optional periodic updates (labs / offline) |
| `mock-ssrm` | SSRM | synthetic rows behind the SSRM query plane |
| `appdata` | — | not a stream: a key/value bag other configs reference via `{{name.key}}` — see [appdata.md](./appdata.md) |

**The CSRM-vs-SSRM discriminator is `isSsrmProviderType(type)`**
(`stomp-ssrm` or `mock-ssrm`). Every mode decision routes through that one
predicate — never test the string suffix inline.

---

## `DataProviderConfig` — the catalog row wrapper

DataProvider configuration wrapper

| Field | Type | | Notes |
|---|---|---|---|
| `providerId` | `string` | optional |  |
| `name` | `string` | **required** |  |
| `description` | `string` | optional |  |
| `providerType` | `ProviderType` | **required** |  |
| `config` | `TransportConfig` | **required** |  |
| `tags` | `string[]` | optional |  |
| `isDefault` | `boolean` | optional |  |
| `userId` | `string` | **required** |  |
| `public` | `boolean` | optional | Visibility: true  → row is saved with userId='system' (visible to everyone sharing the appId). false / undefined → row is saved with the active userId (visible only to the author). The configurator surfaces this as a single "Public" toggle. |


Storage mapping (`DataProviderConfigStore`): `configId = providerId`,
`componentType: 'data-provider'`, `componentSubType = providerType`,
`displayText = name`, `payload = config` + `__providerMeta`. Provider rows
are **platform-global**: every user sees the catalog; `public: true` rows
are owned by `'system'`.

---

## `StompProviderConfig` (`providerType: 'stomp'`)

STOMP Provider Configuration

| Field | Type | | Notes |
|---|---|---|---|
| `providerType` | `'stomp'` | **required** |  |
| `websocketUrl` | `string` | **required** |  |
| `listenerTopic` | `string` | **required** |  |
| `requestMessage` | `string` | optional |  |
| `requestBody` | `string` | optional |  |
| `snapshotEndToken` | `string` | optional |  |
| `heartbeat` | `{ outgoing?: number; incoming?: number; }` | optional |  |
| `keyColumn` | `string \| readonly string[]` | optional | Unique-row identity. A SINGLE column name keys rows by that one field; an array of column names keys rows by the joined values (separator: `-`) — used for datasets with composite primary keys. Drives both the worker-side cache (Hub) and AG-Grid's `getRowId`. |
| `inferredFields` | `FieldInfo[]` | optional |  |
| `columnDefinitions` | `ColumnDefinition[]` | optional |  |
| `conflateEnabled` | `boolean` | optional | Master on/off for live-update conflation. Defaults to ON (`undefined` / `true`). Set `false` to deliver every live row update even when `conflateByKey` / `keyColumn` would otherwise supply a conflation key. This is the explicit disable switch: without it, conflation falls back to `keyColumn` and can't be turned off independently of throttling. |
| `conflateByKey` | `string` | optional | Conflate row updates by this column before fanning out to subscribers. Two updates for the same key value within a `throttleMs` window collapse into the latest one (upsert semantics). Typically set to the same value as `keyColumn` so grids see exactly one update per row per flush. When unset, conflation falls back to `keyColumn`; set `conflateEnabled: false` to turn conflation off entirely. |
| `throttleEnabled` | `boolean` | optional | Master on/off for live-update throttling. Defaults to ON (`undefined` / `true`). Set `false` to fan out every live delta immediately even when `throttleMs` is set — the ms value is kept so re-enabling restores the previous window. |
| `throttleMs` | `number` | optional | Coalesce row-update fanout into trailing-edge bursts every `throttleMs`. 0 / undefined → immediate fanout (no batching). The conflation window above only takes effect when this is set and `throttleEnabled` is not `false`. |
| `snapshotChunkSize` | `number` | optional | Max rows shipped per `postMessage` when flushing the snapshot from the worker to the client. Larger snapshots split into this many rows per replace/delta frame so each main-thread `message` deserialize stays under Chromium's ~50ms long-task budget. Default 500. Settable in code (author the config) or via the provider editor. |
| `projectFields` | `boolean` | optional | Prune incoming rows to the fields the UI can actually see — the `columnDefinitions[].field` paths plus `keyColumn` — at frame-parse time in the worker, BEFORE rows enter the snapshot buffer / hub cache. Upstream feeds that ship wide objects (e.g. 2000 fields when the blotter renders 200) otherwise pay ~10x on worker memory, snapshot encode, postMessage payloads and client parse in every window. Nested paths (`a.b.c`) copy just the needed subtree. Default OFF. Changing the visible fields requires a provider restart (the editor's Restart already rebuilds the slot from the new cfg). |
| `thinDeltas` | `boolean` | optional | Thin field-level deltas. When ON, post-ready live updates broadcast only the top-level fields that actually changed per row (`delta-patch` wire events) instead of full replacement rows — touch updates that change a few fields out of hundreds shrink the hub→window wire by the touch ratio. The client merges each patch into its previous full row producing a NEW row object, so subscribers still observe whole immutable rows. Requires `keyColumn` (ignored without it). Snapshot/replace frames always ship full rows. Default OFF. |
| `wireFormat` | `'json' \| 'columnar'` | optional | Wire codec for binary hub→window frames (snapshot replay, restart broadcast, large live batches). - `'columnar'` (default — see `STOMP_TUNING_DEFAULTS.wireFormat`; the hub runs columnar unless `'json'` is set explicitly) — typed-array columnar frames: numbers travel as raw Float64 and booleans as bitmaps, cutting each window's per-frame decode several-fold on number-heavy feeds. Frames that don't qualify (non-object rows) fall back to JSON per-chunk automatically. - `'json'` — UTF-8 `JSON.stringify` bytes, decoded with `JSON.parse`. |
| `reconnect` | `{ /** Static reconnect delay in ms. Default 5000 (matches prior behaviour). */ initialDelayMs?: number; }` | optional | Reconnect policy — `initialDelayMs` becomes the stompjs `reconnectDelay`. Default 5000. |


### Effective runtime defaults — `STOMP_TUNING_DEFAULTS`

The values the worker applies when a tuning field is unset — single-sourced
so the transport, the hub, and the editor's placeholder text can never
disagree:

| Knob | Effective default | What it is |
|---|---|---|
| `throttleMs` | `25` | Trailing-edge live fan-out window (ms). |
| `snapshotChunkSize` | `500` | Rows per snapshot postMessage chunk. |
| `reconnectInitialDelayMs` | `5000` | stompjs reconnectDelay (ms). |
| `heartbeatMs` | `4000` | Heartbeat interval, both directions (ms). |
| `wireFormat` | `'columnar'` | Binary hub→window codec — columnar unless explicitly 'json'. |
| `publishWindowMs` | `0` | SSRM publish window (ms) — 0 = flush per tick. |

Boolean knobs resolve in the transport as `cfg.conflateEnabled !== false` /
`cfg.throttleEnabled !== false` — both default **ON**; only an explicit
`false` disables.

---

## `StompSsrmProviderConfig` (`providerType: 'stomp-ssrm'`)

STOMP + SSRM Provider Configuration. Same wire/transport as {@link StompProviderConfig}; the SharedWorker attaches an SSRM query plane so grids use `rowModelType: 'serverSide'`.

*Extends `Omit<StompProviderConfig, 'providerType'>` — every base field applies too.*

| Field | Type | | Notes |
|---|---|---|---|
| `providerType` | `'stomp-ssrm'` | **required** |  |
| `blockSize` | `number` | optional | Hint for AG Grid `cacheBlockSize` (client); worker pages by request. |
| `publishWindowMs` | `number` | optional | Trailing-edge SSRM flush window in ms; 0/omitted = per-frame passthrough. Accumulates and key-conflates changed rows across the window before the worker fans a single `ssrm-tick` — see `SsrmServer`/`SsrmPlane` in `@wellsfargo-starui/data`. |


---

## `RestProviderConfig` (`providerType: 'rest'`)

REST Provider Configuration

| Field | Type | | Notes |
|---|---|---|---|
| `providerType` | `'rest'` | **required** |  |
| `baseUrl` | `string` | **required** |  |
| `endpoint` | `string` | **required** |  |
| `method` | `'GET' \| 'POST'` | **required** |  |
| `queryParams` | `Record<string, string>` | optional |  |
| `body` | `string` | optional |  |
| `headers` | `Record<string, string>` | optional |  |
| `pollInterval` | `number` | optional | ⚠ declared but not read by the REST transport today (only `validateProviderConfig` warns on it). |
| `paginationMode` | `'offset' \| 'cursor' \| 'page'` | optional | ⚠ declared but not consumed by any runtime code today. |
| `pageSize` | `number` | optional | ⚠ declared but not consumed by any runtime code today. |
| `auth` | `{ type: 'bearer' \| 'apikey' \| 'basic'; credentials: string; headerName?: string; }` | optional |  |
| `timeout` | `number` | optional | ⚠ declared but not read by the REST transport today. |
| `keyColumn` | `string \| readonly string[]` | optional | Required for streaming consumers (MarketsGrid). The column whose value uniquely identifies a row — drives RowCache upsert + AG-Grid `getRowId`. Accepts an array of column names for composite keys (joined with `-`). |
| `rowsPath` | `string` | optional | Path inside the JSON response that holds the rows array. Dot notation; e.g. `data.results`. Default: response is the rows array directly. |
| `inferredFields` | `FieldInfo[]` | optional | Persisted schema introspection — see StompProviderConfig. |
| `columnDefinitions` | `ColumnDefinition[]` | optional |  |
| `conflateByKey` | `string` | optional | See StompProviderConfig — same fanout knobs apply. |
| `throttleMs` | `number` | optional |  |


---

## `MockProviderConfig` (`providerType: 'mock'`)

Mock Provider Configuration

| Field | Type | | Notes |
|---|---|---|---|
| `providerType` | `'mock'` | **required** |  |
| `dataType` | `'positions' \| 'trades' \| 'orders' \| 'custom'` | **required** |  |
| `updateInterval` | `number` | optional |  |
| `updateIntervalMs` | `number` | optional | Alias for `updateInterval` in ms — preserved for UI template compatibility. |
| `rowCount` | `number` | optional |  |
| `enableUpdates` | `boolean` | optional |  |
| `customData` | `any[]` | optional |  |
| `keyColumn` | `string \| readonly string[]` | optional | Unique-row identity, same semantics as the other streaming configs. Required when this cfg is attached through the SharedWorker hub (`useProviderStream` / `client.attach`) — the hub keys its row cache by `keyColumn` and silently drops rows that don't resolve a value, so a missing field surfaces as an empty grid. Safe to omit when calling `startMock` directly in-process (the in-process path doesn't go through the cache). Typical values per dataType: `'cusip'` for positions, `'tradeId'` for trades, `'id'` for orders. |


Update-interval resolution in the transport:
`updateIntervalMs ?? updateInterval ?? per-dataType default`.

---

## `MockSsrmProviderConfig` (`providerType: 'mock-ssrm'`)

Mock + SSRM Provider Configuration. Same row generator as {@link MockProviderConfig}; the SharedWorker attaches an SSRM query plane so grids use `rowModelType: 'serverSide'` with lab-parity field names (`id`, `cusip`, `bidPrice`, …).

*Extends `Omit<MockProviderConfig, 'providerType'>` — every base field applies too.*

| Field | Type | | Notes |
|---|---|---|---|
| `providerType` | `'mock-ssrm'` | **required** |  |
| `blockSize` | `number` | optional | Hint for AG Grid `cacheBlockSize` (client); worker pages by request. |
| `columnDefinitions` | `ColumnDefinition[]` | optional | Optional persisted column schema for SSRM grids / editors. |
| `publishWindowMs` | `number` | optional | Trailing-edge SSRM flush window in ms; 0/omitted = per-frame passthrough. Accumulates and key-conflates changed rows across the window before the worker fans a single `ssrm-tick` — see `SsrmServer`/`SsrmPlane` in `@wellsfargo-starui/data`. |


---

## `AppDataProviderConfig` (`providerType: 'appdata'`)

AppData Provider Configuration

| Field | Type | | Notes |
|---|---|---|---|
| `providerType` | `'appdata'` | **required** |  |
| `variables` | `Record<string, AppDataVariable>` | **required** |  |


### `AppDataVariable`

| Field | Type | | Notes |
|---|---|---|---|
| `key` | `string` | **required** |  |
| `value` | `string \| number \| boolean \| object` | **required** |  |
| `type` | `'string' \| 'number' \| 'boolean' \| 'json'` | **required** |  |
| `description` | `string` | optional |  |
| `sensitive` | `boolean` | optional |  |


The AppData layer (mirror, hooks, `{{name.key}}` template resolution) has
its own page: [appdata.md](./appdata.md).

---

## `ColumnDefinition` — persisted column schema

Column definition for AG-Grid

| Field | Type | | Notes |
|---|---|---|---|
| `field` | `string` | **required** |  |
| `headerName` | `string` | **required** |  |
| `cellDataType` | `'text' \| 'number' \| 'boolean' \| 'date' \| 'dateString' \| 'object'` | optional |  |
| `width` | `number` | optional |  |
| `filter` | `string \| boolean` | optional |  |
| `sortable` | `boolean` | optional |  |
| `resizable` | `boolean` | optional |  |
| `hide` | `boolean` | optional |  |
| `type` | `string` | optional |  |
| `valueFormatter` | `string` | optional |  |
| `cellRenderer` | `string` | optional |  |
| `valueGetter` | `string` | optional | Optional DSL expression compiled to an AG-Grid `valueGetter` at runtime (via `@wellsfargo-starui/core`'s ExpressionEngine). Column refs use bracket syntax — `[cusip]`, `[a.b.c]` for nested, optional-chaining paths — e.g. `STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null ? [pnl.wrapper.rdiInventoryName] : [inventoryName]` Empty / absent means no override (column falls back to its `field` binding or the default nested-path getter). The expression never throws at runtime: parse/eval failures fall back to the field value. |


`ColumnDefinition` is a deliberately narrow, serializable subset of AG
Grid's `ColDef` — the full per-column customization state (styles,
formatters, templates) lives in the grid customizer's profile state, not on
the provider.

---

## Validation — `validateProviderConfig`

Wired into the provider editor's **save** and **JSON-import** paths. Hard
errors mirror what the transports actually require at attach time:

| Applies to | Condition | Severity | Message |
|---|---|---|---|
| all | `providerType` missing | error | Provider type is required |
| `stomp`, `stomp-ssrm` | `websocketUrl` missing/blank | error | WebSocket URL is required for STOMP providers |
| `stomp`, `stomp-ssrm` | URL present but not `ws://`/`wss://` | warn | WebSocket URL should typically start with ws:// or wss:// |
| `stomp`, `stomp-ssrm` | `listenerTopic` missing/blank | error | Listener topic is required for STOMP providers |
| `rest` | `baseUrl` missing/blank | error | Base URL is required for REST providers |
| `rest` | URL present but not `http://`/`https://` | warn | Base URL should typically start with http:// or https:// |
| `rest` | `endpoint` missing/blank | error | Endpoint is required for REST providers |
| `rest` | `pollInterval` < 1000 | warn | Poll interval is very low (< 1 second), may cause high server load |
| `mock`, `mock-ssrm`, `appdata` | — | *(no per-type rules)* | |

Returns `{ isValid, errors, warnings? }` — `warnings` is `undefined` (not
`[]`) when clean.

---

## Seed formats

Two JSON envelopes exist and are **deliberately incompatible**:

- **Provider export** (`kind: 'starui.dataProvider'`, version 1) — the
  editor's per-provider Export/Import round-trip. Strips `providerId`,
  `userId`, `isDefault`; import mints a fresh row.
- **Deploy seed** (`seed.json`) — a Config Browser "Export ALL" bundle
  (`SeedData`: `activeAppId`, `activeUserId`, `appRegistry`,
  `userProfiles`, `roles`, `permissions`, `appConfig?`). Applied only
  against an empty database (`ConfigManager.seedIfEmpty`).
  `parseSeedJson` **rejects** a provider export dropped in as `seed.json`
  with a pointed error.

---

*Editor seed values (`DEFAULT_PROVIDER_CONFIGS`) differ from the runtime
defaults above — they are the editor's starting form values, not what the
worker applies to an unset field.*
