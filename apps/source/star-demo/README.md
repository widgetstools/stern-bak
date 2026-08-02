# @wellsfargo-starui/star-demo

A **minimal** OpenFin workspace demo that hosts a **MarketsGrid** through a
React Router route and lets you register it as a launchable **workspace
component** via Workspace Setup. It is a trimmed-down clone of
[`markets-ui-react-reference`](../markets-ui-react-reference) — same platform
features, far less boilerplate:

- Generic OpenFin sample views (notifications / FDC3 demos, `view1`/`view2`)
  are removed.
- The dock's **▾ Tools** menu **omits "Import Config" and "Export Config"**.
- One hosted grid route, plus the admin tool windows that make it useful.

> Dev server port: **5175**. OpenFin platform uuid: **`star-demo`**.

---

## Run it

Two processes: the Vite dev server, then the OpenFin client that loads the
manifest. The app resolves `@wellsfargo-starui/*` from the prebuilt tarballs in
`libs/` (consumer parity), so build/propagate the packages first if you
haven't (`npm run build` at the repo root).

### One command (from the monorepo root)

```bash
npm run star-demo
```

This runs `dev:openfin:star-demo` — it starts the dev server, waits for
`http://localhost:5175`, then launches the OpenFin client against
`http://localhost:5175/platform/manifest.fin.json`.

### Or two terminals

```bash
# terminal 1 — dev server (aliases @wellsfargo-starui/* to packages/src)
npm run dev:star-demo            # from repo root
# (equivalent: cd apps/demos/star-demo && npm run dev)

# terminal 2 — OpenFin client
cd apps/demos/star-demo && npm run client
```

`npm run client` runs the bundled OpenFin launcher (`launch.mjs`), which boots
the runtime from the manifest and wires Ctrl-C / process-exit to quit the
platform cleanly.

Outside OpenFin you can still open the routes in a plain browser tab
(`http://localhost:5175/`) — the home page links to the grid and the data
providers editor.

---

## How MarketsGrid is hosted via routes

The grid is **not** a bespoke page — it's the shared `<HostedMarketsGrid>`
widget mounted at a route. [`src/main.tsx`](src/main.tsx) declares it:

```tsx
<Route element={<ViewRoutesLayout />}>
  <Route path="/" element={<App />} />
  <Route path="/blotters/marketsgrid" element={<BlottersMarketsGrid />} />
</Route>
```

`ViewRoutesLayout` wraps these routes in `<StarGridApp>`, which provides the
runtime port, ConfigManager, identity, and theme that the grid needs.
[`src/views/BlottersMarketsGrid.tsx`](src/views/BlottersMarketsGrid.tsx) is
thin — it delegates all hosting to the widget:

```tsx
<HostedMarketsGrid
  componentName="MarketsGrid"
  defaultInstanceId="star-demo-blotter"
  gridId="star-demo-blotter"
  configManager={configManager}
  dataServicesMode="eager"
  theme="auto"
  withStorage
  showFiltersToolbar
  showFormattingToolbar
  showEditingToolbar
  onEditProvider={…}        // opens the Data Providers popout
  onOpenConfigBrowser={…}   // opens the Config Browser popout
/>
```

Because the grid lives at a **URL** (`/blotters/marketsgrid`), the OpenFin
platform can open it as a view inside any workspace tab/window — which is
exactly what makes it registrable (below). When launched, the platform stamps
`customData` (instanceId, componentType, appId, …) onto the view; the widget
reads that identity so each launched instance gets its own config scope —
column layouts, filters, and formatting persist per instance via
`ConfigManager`.

### Registering it as a workspace component (Workspace Setup)

1. Launch the platform (`npm run star-demo`).
2. From the dock, open **▾ Tools → Workspace Setup**.
3. Add a component entry pointing at the grid route:
   - **Host URL**: `/blotters/marketsgrid` (resolved against the provider
     origin, e.g. `http://localhost:5175/blotters/marketsgrid`)
   - **Display name**: e.g. `Markets Blotter`
   - **Component type / subtype**: e.g. `GRID` / your classification
   - **Icon**, **singleton**, etc. as desired.
4. Save. The component is persisted in the **component registry** (an
   app-config row under the global scope) shared by every user of the app.
5. Launch it from Home / the registry — the platform opens
   `/blotters/marketsgrid` as a view with a freshly minted `instanceId`, so
   multiple independent blotters can coexist, each with its own saved layout.

The registry is read/written by `@wellsfargo-starui/openfin` and the
`@wellsfargo-starui/react/workspace-setup` UI; this app only has to **expose the route**.
No per-component wiring is needed in the app beyond the route declaration.

---

## Dock Tools menu — no Import/Export Config

The built-in Tools menu (Workspace Setup, Data Providers, Config Browser,
Reload Dock, Developer Tools, …) is provided by `@wellsfargo-starui/openfin`.
This app hides the two config-bundle items by passing their action IDs to the
new opt-in `dock.excludeTools` option in
[`src/platform/Provider.tsx`](src/platform/Provider.tsx):

```ts
import { initWorkspace, ACTION_EXPORT_CONFIG, ACTION_IMPORT_CONFIG } from "@wellsfargo-starui/openfin";

initWorkspace({
  dockIcon: "http://localhost:5175/dock-provider.png",
  roles: ["admin", "developer"],
  components: { home: false, store: false },
  dock: { excludeTools: [ACTION_EXPORT_CONFIG, ACTION_IMPORT_CONFIG] },
});
```

`excludeTools` filters both the classic (dock2) Tools dropdown and the dock3
content menu, by action ID. Omit the option to show every built-in tool.

---

## Config & seeding

| File | Purpose |
|------|---------|
| [`public/platform/manifest.fin.json`](public/platform/manifest.fin.json) | OpenFin manifest — runtime, `platform.providerUrl`, and `customSettings` (`appId`, `userId`, `seedConfigUrl`, REST toggle). |
| [`public/app-config.json`](public/app-config.json) | Browser-mode bootstrap (no OpenFin) — mirrors the manifest `customSettings`. |
| [`public/seed.json`](public/seed.json) | **Seeds the config store on first run**: permissions, roles, the `appRegistry` entry, and `userProfiles`. |

### How seeding works

On first launch `initWorkspace()` creates a `ConfigManager` with
`seedConfigUrl` (→ `/seed.json`, resolved against the manifest `providerUrl`
origin) and calls `init()`, which seeds the database when IndexedDB is empty.
`seed.json` is also the **canonical source of `appId`**: `platformBootstrap.ts`
resolves the `appRegistry` entry whose `manifestUrl` matches the current origin
and uses its `appId` (`StarDemo`) as the scope key for every config row — keeping
`(instanceId, appId, userId)` stable across browser and OpenFin so saved
settings survive restarts.

To re-seed from scratch, clear the app's IndexedDB (DevTools → Application →
IndexedDB) and relaunch.

### Ship config with the app (recommended for end users)

1. Run the app locally and configure providers, grids, dock, workspaces, etc.
2. Open **Config Browser** → **Export** → **rocket** (deploy bundle).
3. Save the download as `public/seed.json` (the rocket button names the file
   `seed.json` automatically).
4. Commit `public/seed.json` with your release.
5. Run `npm run validate:seed` in this app folder before shipping (CI-friendly).

End users get your layout on **first launch** — no manual import. The platform
only seeds when IndexedDB is empty (`seedConfigReload` defaults to `empty-only`).

**Developer iteration:** set `"seedConfigReload": "when-changed"` in
`app-config.json` / manifest `customSettings` to re-apply `seed.json` whenever
its content changes (clears and re-seeds). Do not ship that flag to production.

---

## Routes

| Route | What it is |
|-------|-----------|
| `/` | Thin home page (dev shortcuts). |
| `/platform/provider` | OpenFin platform provider window — boots the workspace + dock. |
| `/blotters/marketsgrid` | **Hosted MarketsGrid** — the registrable component. |
| `/dataproviders` | Data Provider editor (STOMP / REST / Mock / AppData). |
| `/config-browser` | Config Browser. |
| `/workspace-setup` | Workspace Setup (component registry + dock editor). |
| `/rename-view-tab` | "Save Tab As" popout for renaming view tabs. |

---

## Relationship to the reference app

| | `markets-ui-react-reference` | `star-demo` |
|--|--|--|
| Sample views (View1/View2, FDC3, notifications) | ✅ | ❌ removed |
| `view1`/`view2` app registrations | ✅ | ❌ removed |
| Hosted MarketsGrid route | ✅ | ✅ |
| Data Providers / Config Browser / Workspace Setup | ✅ | ✅ |
| Dock Import/Export Config | ✅ | ❌ hidden via `dock.excludeTools` |
| Port | 5174 | 5175 |
