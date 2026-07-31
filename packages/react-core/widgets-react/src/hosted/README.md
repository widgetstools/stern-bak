# `@wellsfargo-starui/widgets-react/hosted`

Hosted-feature wrappers for MarketsUI React apps. The flagship export is
`<HostedMarketsGrid>` — a single component that collapses what was
previously a six-deep stack (`BlottersMarketsGrid → HostedFeatureView →
HostedComponent → BlotterGrid → MarketsGridContainer → MarketsGrid`)
into one call site. The wrapper owns identity resolution (OpenFin and
browser), ConfigService-backed storage, the AG-Grid blotter theme, the
data-services mount, the full-bleed layout, the ConfigManager
loading guard, the legacy view-state cleanup, and the document title
— leaving the call site to do nothing more than name the grid and
supply the data-services client.

## Minimum-viable usage

```tsx
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';

export default function Blotter() {
  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="markets-ui-reference-blotter"
      documentTitle="MarketsGrid · Blotter"
      withStorage
      gridId="markets-ui-reference-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      showFiltersToolbar
      showFormattingToolbar
    />
  );
}
```

That is the entire route view in
[`apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx`](../../../../apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx).

## Props

`HostedMarketsGridProps<TData>` extends `MarketsGridContainerProps<TData>`
with `instanceId`, `appId`, `userId`, `storage`, `theme`, and
`componentName` *omitted* — those are derived from the hosted identity.
Everything else flows through to `MarketsGridContainer` and on to
`MarketsGrid` (per refactor decision D7: flat props, no `gridProps`
namespacing).

### Wrapper-owned props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `componentName` | `string` | — (required) | Logical component name. Surfaces in the toolbar info popover and is used as a diagnostic identifier in storage-factory logs. |
| `defaultInstanceId` | `string` | — (required) | Fallback `instanceId` when neither OpenFin `customData.instanceId` nor `?instanceId=` URL param resolves one. Must be stable so refresh / first-run converge. |
| `defaultAppId` | `string?` | `'markets-ui-reference'` | Fallback `appId` when OpenFin customData omits one. |
| `defaultUserId` | `string?` | `'dev1'` | Fallback `userId` when OpenFin customData omits one. |
| `documentTitle` | `string?` | `componentName` | `document.title` while the wrapper is mounted. The previous title is restored on unmount. |
| `withStorage` | `boolean?` | `false` | When true, build a `StorageAdapterFactory` from the host ConfigManager and pass it to the grid. The factory is wrapped to auto-inject `componentType` / `componentSubType` / `isTemplate` / `singleton` from the OpenFin Registry on every call. |
| `configManager` | `ConfigManager?` | resolved lazily from `@wellsfargo-starui/openfin-platform/config` | Explicit override. Use in tests or in non-OpenFin runtimes that supply their own ConfigManager. |
| `theme` | `'auto' \| 'dark' \| 'light'` | `'auto'` | AG-Grid blotter theme mode. `'auto'` follows the host's `[data-theme]` attribute on `<html>` via a MutationObserver. |
| `dataServicesClient` | `SharedWorkerDataServicesClient?` | — | Optional data-services client. When provided, the wrapper mounts a `<DataServicesProvider>`. Omit when an ancestor already provides data-services context. |
| `caption` | `string?` | `componentName` | Caption forwarded to `MarketsGridContainer` *only when the host OpenFin window has hidden its tab strip*. When tabs are visible nothing is forwarded; when hidden and `caption` is omitted, `componentName` is used as the fallback. The wrapper does not render the caption itself — it forwards both the resolved string and the `tabsHidden` flag, leaving the layout decision to the grid. |

## Workspace save

When mounted inside an OpenFin workspace, `<HostedMarketsGrid>` connects
to the platform-side `marketsui-workspace-save-channel` (see
[`useWorkspaceSaveEvent`](./useWorkspaceSaveEvent.ts)) and registers an
awaited flush callback. The callback runs the same code path the
toolbar **Save** button uses — `MarketsGridHandle.profiles.saveActiveProfile()`
— so any column / filter / formatting edits that haven't been saved
explicitly still round-trip through OpenFin's *Save Workspace*. The
platform `dispatch` blocks on each connected view's promise before
capturing the snapshot, so flushes complete before serialization. The
hook is a no-op outside OpenFin.

### Inherited from `MarketsGridContainer`

The remaining props are forwarded verbatim — selected highlights:

| Prop | Type | Purpose |
|---|---|---|
| `gridId` | `string` | Required by `MarketsGrid`; keys profile and view-state rows. |
| `historicalDateAppDataRef` | `string?` | `'appDataProviderName.key'` target for the historical date picker. |
| `onEditProvider` | `(id: string) => void` | Open the provider editor. The reference app forwards this to `data-services-popout.ts` to launch a popout window. |
| `onError` | `(err: Error) => void` | Stream-error sink. Defaults to `console.error`. |
| `showFiltersToolbar` | `boolean?` | Show the filters toolbar above the grid. |
| `showFormattingToolbar` | `boolean?` | Show the formatting toolbar above the grid. |
| `defaultColDef` | `ColDef?` | Forwarded to AG-Grid. |
| `modules` | `CockpitModule[]?` | Forwarded to MarketsGrid. |
| `adminActions` | `AdminAction[]?` | Forwarded admin-menu entries. |

The full `MarketsGridContainerProps` and `MarketsGridProps` interfaces
are the source of truth for everything else.

## OpenFin vs browser auto-detection

Identity resolution is owned by `useHostedIdentity` and follows the
same rules the legacy `HostedComponent` used:

1. **OpenFin path** — when `typeof fin !== 'undefined'`, read
   `fin.me.getOptions().customData` for `instanceId`, `appId`,
   `userId`, plus the four registered-component fields
   (`componentType`, `componentSubType`, `isTemplate`, `singleton`).
   Any throw falls through to the browser path silently.
2. **Browser path** — `window.location.search`'s `?instanceId=` query
   param wins, otherwise `defaultInstanceId` / `defaultAppId` /
   `defaultUserId` are used. The four registered-component fields are
   left `null`, in which case the storage factory falls back to its
   legacy hardcoded discriminator.

`identity.instanceId` is `null` while the OpenFin lookup is in flight;
the wrapper's `ConfigManagerLoadingGuard` shows a "Connecting to
ConfigService…" placeholder until both `instanceId` and (when
`withStorage` is true) `storage` are populated.

## Theming

The wrapper uses `useAgGridTheme`, which composes
`themeQuartz.withParams(...)` against the design-system blotter
preset:

- [`packages/design-system/src/adapters/ag-grid.ts`](../../../../design-system/src/adapters/ag-grid.ts)
  exports `agGridBlotterLightParams` and `agGridBlotterDarkParams`.

**Updating that preset re-themes every blotter that uses
`<HostedMarketsGrid>` at once.** No colour, font, or spacing constants
live in this package — they all resolve through the design-system. The
`useAgGridTheme.test.tsx` suite spies on `themeQuartz.withParams` and
deep-equals its first argument against the design-system params to
guard against drift.

Theme switching: when `theme === 'auto'`, a MutationObserver on
`<html>`'s `data-theme` attribute keeps the resolved theme reactive to
runtime flips. The host app is free to drive `data-theme` from
whatever theme context it likes (`next-themes`, the reference app's
local `ThemeContext`, OpenFin's IAB broadcast) — the wrapper does not
import any host theme context.

## Persistence model

Two distinct layers of persistence flow through the wrapper:

- **Grid-level provider selection** is stored as `MarketsGrid`'s
  `gridLevelData` under the key `markets-grid-provider-selection`.
  Persisted on every change via the ConfigService adapter; survives
  refresh and OpenFin workspace restore.
- **Profile-scoped state** (column customisation, conditional styling,
  calculated columns, sort/filter overrides, etc.) lives inside each
  profile row managed by the profile manager. Switching profiles
  swaps that whole bundle; grid-level provider selection is
  intentionally *not* part of the profile so a user can pin a
  provider once and try several profiles against it.

When `withStorage` is true and the ConfigManager + registered identity
both resolve, every adapter call carries the four registered-component
fields. This is what powers the workspace-isolated storage rows
documented in `docs/IMPLEMENTED_FEATURES.md`.

The wrapper also runs a one-shot `marketsgrid-view-state::*` cleanup
effect on mount, gated by a `localStorage` sentinel
(`hosted-mg.legacy-cleanup`). It deletes the legacy row at
`marketsgrid-view-state::<instanceId>` exactly once per browser to
free up storage abandoned by the pre-refactor stack.

## Parity matrix

Each row is the behaviour the original six-deep stack provided. The
wrapper preserves every one — Vitest specs in `__tests__/` cover them
at the wrapper boundary, with inherited rows additionally covered by
`markets-grid-container`'s and `markets-grid`'s own suites.

| # | Feature | Test |
|---|---|---|
| 1 | OpenFin identity via `fin.me.getOptions()` | `useHostedIdentity.openfin.test.tsx` |
| 2 | Browser fallback (URL param + props) | `useHostedIdentity.browser.test.tsx` |
| 3 | Registered-component fields surfaced from OpenFin | `useHostedIdentity.storage-wrap.test.tsx` |
| 4 | Storage factory auto-injects registered metadata | `useHostedIdentity.storage-wrap.test.tsx` |
| 5 | ConfigManager singleton resolution + memoization | `config-manager.test.tsx` |
| 6 | `withStorage` opt-in to ConfigService adapter | `with-storage.test.tsx` |
| 7 | Document title set on mount, restored on unmount | `document-title.test.tsx` |
| 8 | Full-bleed fixed layout | `full-bleed.test.tsx` |
| 9 | DataServices provider mount | `dataServicesMount.test.tsx` |
| 10 | ConfigManager loading-state guard | `config-manager.test.tsx` |
| 11 | AG-Grid blotter theme | `useAgGridTheme.test.tsx` |
| 12 | Theme switching driven by `[data-theme]` | `useAgGridTheme.test.tsx` |
| 13 | `showFiltersToolbar` / `showFormattingToolbar` flags | `toolbar-flags.test.tsx` |
| 14 | `onEditProvider` callback | `on-edit-provider.test.tsx` |
| 15 | Legacy `marketsgrid-view-state::*` cleanup | `legacy-cleanup.test.tsx` |
| 16 | Provider picker (Alt+Shift+P, ProviderToolbar) | `provider-picker.test.tsx` |
| 17 | Snapshot + live-update subscription lifecycle | `inherited-features.test.tsx` (+ MGC) |
| 18 | Grid-level provider persistence | `inherited-features.test.tsx` (+ MGC) |
| 19 | Profile manager / settings sheet / dirty dot | `inherited-features.test.tsx` (+ MG) |
| 20 | Admin actions, headerExtras, gridLevelData passthrough | `inherited-features.test.tsx` |
| 21 | Toolbar ⓘ popover surfaces componentName | `grid-info-popover.test.tsx` |

End-to-end coverage is in
[`e2e/hosted-markets-grid.spec.ts`](../../../../../e2e/hosted-markets-grid.spec.ts).

## Hooks

`<HostedMarketsGrid>` is the integrated entry point, but every primitive
it composes is also exported standalone so any hosted feature — not
just MarketsGrid — can pick the slice it needs. Each hook degrades
safely when the OpenFin (or FDC3) runtime isn't present, so the same
call site works inside the OpenFin browser and inside `apps/demos/demo-react`.

| Hook | Purpose |
|---|---|
| [`useHostedIdentity`](./useHostedIdentity.ts) | Resolve `instanceId` / `appId` / `userId` and (optionally) a wrapped `StorageAdapterFactory` from OpenFin customData with browser fallback. |
| [`useAgGridTheme`](./useAgGridTheme.ts) | AG-Grid `Theme` reactive to the host's `[data-theme]` attribute. |
| [`useTabsHidden`](./useTabsHidden.ts) | Boolean state mirroring the parent OpenFin window's tab-strip visibility. |
| [`useColorLinking`](./useColorLinking.ts) | `{ color, linked }` mirror of the workspace browser's color-link button. |
| [`useFdc3Channel`](./useFdc3Channel.ts) | Thin wrapper over `window.fdc3` user channels: `current`, `join`, `leave`, `addContextListener`, `broadcast`. |
| [`useIab`](./useIab.ts) | Generic OpenFin Inter-Application Bus pub/sub: `{ subscribe, publish }`. |
| [`useOpenFinChannel`](./useOpenFinChannel.ts) | OpenFin Channel API factory: `{ createProvider, connect }` with auto-teardown on unmount. |
| [`useWorkspaceSaveEvent`](./useWorkspaceSaveEvent.ts) | Register an awaited flush callback that runs before the platform captures a workspace snapshot, plus an optional post-save listener. |
| [`useGridContextLink`](./useGridContextLink.ts) | Grid-to-grid context linking over OpenFin's colored "Link" groups: broadcasts the grid's selection (key-field values, or grouped column id + key) and filters rows on contexts received from linked peers. Built on `useFdc3Channel`; pure helpers in [`gridContextLink.ts`](./gridContextLink.ts). |
| [`useHostedView`](./useHostedView.ts) | Single composing hook that wires every hook above. Use this when you want everything; otherwise compose à-la-carte. |

### `useHostedView` example

```tsx
import { useRef } from 'react';
import { useHostedView } from '@wellsfargo-starui/widgets-react/hosted';
import { MarketsGridContainer, type MarketsGridHandle } from '@wellsfargo-starui/markets-grid';

export function HostedBlotter() {
  const gridRef = useRef<MarketsGridHandle>(null);

  const { identity, ready, agTheme, tabsHidden, linking } = useHostedView({
    componentName: 'MyBlotter',
    defaultInstanceId: 'my-blotter',
    withStorage: true,
    theme: 'auto',
    onWorkspaceSave: async () => {
      await gridRef.current?.profiles.saveActiveProfile();
    },
  });

  if (!ready) return null;

  return (
    <MarketsGridContainer
      ref={gridRef}
      gridId="my-blotter"
      instanceId={identity.instanceId!}
      appId={identity.appId}
      userId={identity.userId}
      storage={identity.storage ?? undefined}
      theme={agTheme}
      // Render your own caption when the OpenFin browser hides tabs.
      caption={tabsHidden ? 'My Blotter' : undefined}
    />
  );
}
```

`linking.color`, `linking.fdc3`, and `linking.channel` give you the same
state and helpers `useColorLinking()` / `useFdc3Channel()` /
`useOpenFinChannel()` would return — bundled here for convenience.

Color linking is a **flat peer group keyed by color** — there is no
parent/child or publisher/subscriber hierarchy. Every view joined to the
same color is an equal member: each both broadcasts to and receives from
the group. `useColorLinking` only reports *this* view's own membership
(`{ color, linked }`); the actual messages travel over the FDC3 channel
(`linking.fdc3`). `HostedMarketsGrid`'s `contextLink` prop wires that
transport into the grid via [`useGridContextLink`](./useGridContextLink.ts):

```tsx
<HostedMarketsGrid
  componentName="MarketsGrid"
  // …
  contextLink={{ enabled: true }}
/>
```

With it enabled the grid broadcasts its selection to linked peers and
filters its own rows on the selections it receives from them.

Two modes (config `mode`):

- **`'rowId'` (default)** — broadcasts the row id AG-Grid's `getRowId`
  produced for each selected row (`node.id` = `composeRowId` over the
  **data provider's key fields**). Peers apply it as an external filter
  that keeps only those rows. Needs **no `rowIdField` config** — the
  provider already drives `getRowId`, so two grids on the same provider
  keying match for free. The external filter AND's with the user's own
  column filters.
- **`'fields'`** — broadcasts the selected rows' `rowIdField` values and
  peers apply them as a per-column set-filter. Use when peers key rows
  differently and you want to match on shared business fields; set
  `rowIdField` to the provider's `keyColumn`.

Pass `resolve` / `buildContext` to override the receive/publish mapping.
