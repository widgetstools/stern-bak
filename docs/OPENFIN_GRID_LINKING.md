# OpenFin Grid-to-Grid Context Linking

Color-linked MarketsGrid instances share **row selection** with each other and
post **Notification Center** messages for the traffic. When two (or more) grids
are linked to the same color group via the workspace dock **Link** button:

1. Selecting row(s) in grid **A** broadcasts the selection's **key columns +
   values** (the fields that compose `getRowId`) — and, for grouped
   selections, the key columns of every selected group's **leaf rows**.
2. Every peer grid on the same color group **applies a filter** for the columns
   it shares with the payload (non-matching columns are ignored).
3. With notifications enabled, the sender posts a *"Linked selection sent"*
   message and each receiver posts a *"Linked selection received"* (ack).

Linking is a **flat peer group keyed by color** — there is no
publisher/parent → subscriber/child hierarchy. Every member both broadcasts and
receives.

---

## How to enable

Pass the `contextLink` prop to `<HostedMarketsGrid>` (or any host that wires
`useGridContextLink`):

```tsx
<HostedMarketsGrid
  gridId="my-blotter"
  /* …data-provider props… */
  contextLink={{
    enabled: true,     // master switch (default: off)
    mode: 'fields',    // 'fields' = key columns + values (recommended);
                       // 'rowId'  = opaque composed getRowId values
    notify: true,      // post Notification Center messages (default: off)
  }}
/>
```

That is the **entire** app-level wiring — see the live example in
`apps/demos/star-demo/src/views/BlottersMarketsGrid.tsx`.

### `GridContextLinkConfig` options

Defined in `packages/react-core/widgets-react/src/hosted/useGridContextLink.ts`.

| Field | Default | Purpose |
|---|---|---|
| `enabled` | `false` | Master switch. Linking is inert unless `true`. |
| `mode` | `'rowId'` | `'fields'` broadcasts key columns + values (per-column set-filter on peers — **use this**); `'rowId'` broadcasts the composed `getRowId` values (external filter; only works when peers key rows identically). |
| `publish` | `true` | Broadcast this grid's selection to peers. |
| `receive` | `true` | Apply incoming peer selections as a filter. |
| `rowIdField` | auto | `'fields'` mode key column(s). **Do not hardcode** — `HostedMarketsGrid` auto-fills it from the active provider's `keyColumn` (the same fields that drive `getRowId`). Only set it to override. |
| `notify` | `false` | Post OpenFin Notification Center messages for sent/received link traffic. |
| `debug` | `false` | Emit verbose `[gridLink]` / `[interop]` console diagnostics (see below). Genuine error warnings always log regardless. |
| `contextType` | `'starui.gridSelection'` | Context type used on the wire. |
| `resolve` / `buildContext` | defaults | Override the receive-side context→filter and publish-side selection→context mappings. |

> **Recommended:** `{ enabled: true, mode: 'fields', notify: true }` and let
> `rowIdField` auto-derive. This sends the real key columns + values and filters
> peers precisely.

---

## Prerequisites

| Requirement | Why | Notes |
|---|---|---|
| OpenFin **Workspace platform** | Linking rides OpenFin interop; the dock supplies the color **Link** button. | `initWorkspace()` (see `@wellsfargo-starui/openfin-platform`) registers Home/Dock/Store/Notifications. |
| `fin.me.interop` available | The transport (`setContext` / `addContextHandler`) operates on the dock-linked context group. | Available **by default** in platform views — **no manifest flag required**. |
| Notifications provider registered | For the Notification Center messages (`notify: true`). | Registered automatically by `initWorkspace()` via `registerNotifications()` — **no manifest entry required**. |
| Two+ windows joined to the **same color** | The dock **Link** control joins each window to a color context group; only same-group windows exchange context. | Verify both show the same color; the link notifications print the channel for confirmation. |

Outside an OpenFin runtime everything **degrades to a no-op** (no `fin`, no
`window.fdc3`), so the hooks are safe to mount in a browser (`demo-react`, unit
tests) without conditional code.

---

## Manifest configuration

For the **interop transport (the one actually used in OpenFin), no manifest
change is required** — `fin.me.interop` and the notifications provider are both
available through the standard workspace platform.

The only optional manifest entry is for the **FDC3 fallback** transport
(`window.fdc3`, used only when interop is somehow unavailable). FDC3 is opt-in:

```jsonc
// apps/demos/star-demo/public/platform/manifest.fin.json
"platform": {
  "uuid": "star-demo",
  // …
  "defaultViewOptions":   { "fdc3InteropApi": "2.0" },
  "defaultWindowOptions": { "fdc3InteropApi": "2.0" }
}
```

`fdc3InteropApi: "2.0"` enables `window.fdc3` for every view/window the platform
creates (per OpenFin docs it can also be set per-view in a `*.fin.json`). It is
**optional** for this feature because the interop transport doesn't need it, but
it's harmless and lets `window.fdc3` work for other FDC3 consumers.

> **Why interop and not FDC3?** The dock **Link** button joins windows to
> OpenFin **interop context groups**. `window.fdc3`'s `getCurrentChannel()` /
> `userChannelChanged` do **not** reliably reflect that membership — a
> dock-linked view can report "no channel" and silently drop every broadcast.
> Interop's `setContext` / `addContextHandler` route on the entity's current
> context group with no channel bookkeeping, so they work where FDC3 doesn't.

Notifications need **no** `notifications` block in the manifest; the provider is
registered in code by `initWorkspace()`.

---

## Where it's implemented

All of the reusable implementation lives in
`packages/react-core/widgets-react/src/hosted/` (exported from that package's
`./hosted` subpath barrel, `index.ts`).

| File | Responsibility |
|---|---|
| `gridContextLink.ts` | Framework-free core. `buildSelectionContext` (publish: leaf-row key columns; **expands groups to their `allLeafChildren`** so any selection of groups/sub-groups/rows resolves to precise row keys), `buildRowIdContext` (rowId mode), `defaultGridLinkResolver` + `applyGridLinkContext` (receive: build a set-filter from `criteria`, **applying only columns the receiver actually has**), `applyRowIdExternalFilter`, `normalizeRowIdField`, and the `GridLinkSelectionContext` wire type. Pure → unit tested in `gridContextLink.test.ts`. |
| `useGridContextLink.ts` | React wiring. Subscribes to AG-Grid `selectionChanged` (publish) and the transport's context listener (receive). Owns the `GridContextLinkConfig` type, a **per-window source id** (`makeSourceId`, so two instances of the same view don't drop each other's broadcasts as self-echo), and the `onPublish`/`onReceive` callbacks. |
| `useInteropChannel.ts` | **Primary transport** — OpenFin interop facade (`fin.me.interop.setContext` / `addContextHandler`), shape-compatible with the FDC3 facade. `isInteropAvailable()` gates its use. |
| `useFdc3Channel.ts` | Fallback transport — minimal `window.fdc3` facade (`broadcast` / `addContextListener` / channel tracking). Used only when interop is absent. |
| `useColorLinking.ts` | Derives the parent window's link color from OpenFin window options (diagnostic / channel label). |
| `gridLinkNotifications.ts` | Pure notification formatters: `buildSelectionNotification`, `buildAckNotification`, `summarizeCriteria` (caps the displayed value list so a whole-group selection doesn't produce a giant toast). Unit tested in `gridLinkNotifications.test.ts`. |
| `useGridLinkNotifications.ts` | Dispatches the formatted notifications via `@wellsfargo-starui/host-openfin` (`loadOpenFinNotificationsApi` / `dispatchOpenFinNotification`); no-op outside OpenFin. Returns the `onPublish`/`onReceive` callbacks. |
| `HostedMarketsGrid.tsx` | Orchestration: picks the transport (interop preferred), auto-derives `rowIdField` from the provider (via the container callback), and wires `useGridContextLink` + `useGridLinkNotifications`. |

Supporting pieces outside `hosted/`:

| File | Responsibility |
|---|---|
| `container/markets-grid-container/MarketsGridContainer.tsx` | Resolves `rowIdField` from the active provider's `keyColumn` (drives `getRowId`) and surfaces it via the `onRowIdFieldChange` callback so the host links off the same fields — no hardcoding. |
| `packages/openfin/host-openfin/src/notifications.ts` | The single seam onto `@openfin/workspace/notifications`: `loadOpenFinNotificationsApi`, `dispatchOpenFinNotification`. |
| `packages/openfin/openfin-platform/src/notifications.ts` | `registerNotifications()` — registers the Notification Center provider during `initWorkspace()`. |
| `apps/demos/star-demo/src/views/BlottersMarketsGrid.tsx` | Demo wiring (`contextLink` prop). |
| `apps/demos/star-demo/public/platform/manifest.fin.json` | Optional `fdc3InteropApi` defaults (see above). |

---

## Wire format

Broadcast payload (`GridLinkSelectionContext`, `mode: 'fields'`):

```jsonc
{
  "type": "starui.gridSelection",   // contextType
  "source": "uuid/window-name",     // per-window id (echo suppression)
  "channel": "purple",              // diagnostic: the joined group/color
  "criteria": {                      // column -> de-duplicated values
    "positionId": ["POS-1", "POS-2"]
  }
}
```

- **Single key column:** `{ "positionId": ["POS-1"] }`
- **Composite key:** `{ "book": ["Alpha"], "positionId": ["POS-1"] }`
- **Whole group / sub-group selected:** the union of every leaf row's key
  columns under the selected group(s).
- **Empty `criteria`** (nothing selected) tells peers to clear the link filter.

Receive: peers build a per-column **set filter** from `criteria` (AND across
columns, OR within a column), keeping **only columns they own**, merged with the
user's own column filters (manual filters survive).

---

## Diagnostics

Set `contextLink.debug: true` to emit console diagnostics (off by default; open
OpenFin DevTools via `chrome://inspect` on the runtime's
`--remote-debugging-port`). star-demo's blotter sets `debug: true`:

- `[interop] setContext ok` — a broadcast went out (entity is in a group). A
  `setContext failed (entity not in a context group?)` warning means this window
  isn't actually linked.
- `[gridLink] publish { self, channel, context }` — what was broadcast.
- `[gridLink] receive { self, from, channel, isEcho, context }` — an incoming
  context (and whether it was dropped as our own echo).

With `notify: true`, each notification body also prints the channel, e.g.
*"…on channel `purple`"* or *"…(no channel — peers won't receive)"*, so a
channel/color mismatch is visible without DevTools (independent of `debug`).

---

## Testing (two linked star-demo grids)

1. Launch the **star-demo** OpenFin workspace (its `manifest.fin.json`).
2. Open two MarketsGrid blotters (`/blotters/marketsgrid`).
3. In the dock, **Link** both windows to the **same color**.
4. In one grid:
   - select individual rows → the peer filters to those rows + posts an ack;
   - group by a column, select a whole group / sub-group / mixed rows → the peer
     filters to the exact leaf rows of the selection;
   - deselect → the peer clears the link filter.

---

## Known limitations

- **SSRM:** under the server-side row model a collapsed group's
  `allLeafChildren` aren't loaded, so a selected-but-unloaded group contributes
  no keys. (star-demo is client-side, so unaffected.)
- **Very large selections:** selecting a huge group broadcasts all its leaf keys
  (no payload cap, by design, for accuracy). Tens of thousands of keys make the
  set filter + interop payload heavy — add an upper bound if that's a concern.
- **Cross-data peers:** receivers filter by key/business columns they share; a
  peer with different data or no matching columns simply shows nothing or
  ignores the context.
