# DataProvider Editor (`dataprovider-editor`) — pure widget composition

A full data-provider workspace assembled **entirely from pre-shipped StarUI
widgets** — zero hand-rolled provider plumbing. Two `HostedMarketsGrid`
panels dock side by side sharing one SharedWorker data hub; the
`DataProviderEditor` and `ConfigBrowserPanel` widgets are summoned on demand
as floating windows from a shadcn `Menubar`.

```bash
npm run dev        # http://localhost:5193
npm run typecheck  # tsc --noEmit
npm test           # vitest (70% per-file coverage gate)
```

## What it demonstrates

- **Async bootstrap gate** — [`src/main.tsx`](./src/main.tsx) awaits
  `initPlatformBootstrap()` (which resolves
  [`public/app-config.json`](./public/app-config.json) and calls
  `ensurePlatformReady` with the packaged worker asset) before first render,
  and shows a destructive `Alert` if the SharedWorker hub fails.
- **Single provider, many consumers** — pick the same provider config in
  Grid A and Grid B and the hub fans the stream out from one cache.
  `keyColumn` is mandatory: the hub indexes its row cache by it.
- **Floating, non-dockable panels** — `addPanel({ dockable: false })` +
  `floatPanel`, with `MenubarCheckboxItem` state kept in sync via
  `onWillClose`.
- **The `translateZ(0)` containing-block trick** — `HostedMarketsGrid` and
  `ConfigBrowserPanel` render `position: fixed; inset: 0` (they are designed
  for full-viewport OpenFin views); a `transform` on the wrapper pins them
  inside their dock panel. Non-obvious and worth copying.
- **Four independent persistence layers** — provider configs in IndexedDB
  (`marketsui-config/appConfig`), per-grid picker + profiles in
  `localStorage` under `marketsGridLocalStorageBundleKey(instanceId)`, the
  dock layout under its own key, and the theme under the design-system key.
  The in-app help sheet tabulates all four.

## StarUI surfaces consumed

`@wellsfargo-starui/grid/widgets/hosted` (`HostedMarketsGrid`) ·
`/widgets/provider-editor` (`DataProviderEditor`) · `/config-browser`
(`ConfigBrowserPanel`) · `@wellsfargo-starui/data` (bootstrap + `/runtime` +
worker asset) · `@wellsfargo-starui/react` (+`/data/runtime`
`DataHubProvider`) · `@wellsfargo-starui/core` (storage-key helper) ·
`@wellsfargo-starui/design-system` (+`/css`) · `@wellsfargo-starui/types`.

Third-party: `@widgetstools/react-dock-manager` + `dock-manager-core` for
the docking shell (its chrome uses the dock library's own palettes — wired
to the theme toggle, but it does not track `--ds-*` token changes).

> Framework docs: [`docs/latest/`](../../../docs/latest/README.md).
