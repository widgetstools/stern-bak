# MarketsGrid Usage Guide

**Audience:** application developers integrating `@wellsfargo-starui/grid` into browser or OpenFin apps.

**Scope:** how to choose and wire the three React entry points (`MarketsGrid`, `MarketsGridContainer`, `HostedMarketsGrid`), bootstrap the SharedWorker data hub, attach providers, and persist grid state — across common deployment scenarios.

**Related docs:**

| Document | Focus |
|----------|--------|
| [`STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`](./STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md) | Step-by-step STOMP wiring |
| [`guides/platform-bootstrap-config.md`](./guides/platform-bootstrap-config.md) | `appId` / `userId` / REST bootstrap |
| [`guides/platform-hooks-demo.md`](./archive/platform-hooks-demo.md) | AppData bootstrap hooks + grid event callbacks |
| [`guides/consumer-app-sharedworker-and-tailwind.md`](./archive/consumer-app-sharedworker-and-tailwind.md) | Vite + SharedWorker consumer setup |
| [`PROFILE_PERSISTENCE.md`](./PROFILE_PERSISTENCE.md) | Profile keys, workspace save, storage adapters |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Monorepo layer model |

---

## 1. Component model — three layers

MarketsGrid is never “just drop in a grid” in production streaming apps. Pick the layer that matches how much wiring you want to own.

```
┌─────────────────────────────────────────────────────────────────┐
│  HostedMarketsGrid          (@wellsfargo-starui/widgets-react/hosted)      │
│  • Full-bleed layout, OpenFin identity, workspace-save hook     │
│  • Optional nested DataHubProvider when `platform` prop set     │
│  • Forwards toolbar / storage / theme props                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  MarketsGridContainer       (@wellsfargo-starui/widgets-react)             │
│  • Provider picker toolbar (Alt+Shift+P)                        │
│  • Hub attach via useDataProvider / defaultLiveProviderId       │
│  • Merges provider columnDefs + live row stream                 │
│  • Persists picker + profile in gridLevelData                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  MarketsGrid                (@wellsfargo-starui/grid)                      │
│  • AG Grid Enterprise blotter + customizer modules              │
│  • Expects rowData + columnDefs (you supply data)               │
│  • Profile / toolbar / side-bar features                        │
└─────────────────────────────────────────────────────────────────┘
```

### When to use which

| Layer | Use when | You supply | Hub required? |
|-------|----------|------------|---------------|
| **`MarketsGrid`** | Feature lab, static/mock rows, custom data pipeline | `rowData`, `columnDefs`, optional `storage` | No |
| **`MarketsGridContainer`** | Custom page layout; you own chrome but want provider picker + hub attach | `gridId`, optional `defaultLiveProviderId` | Yes (`DataHubProvider` ancestor) |
| **`HostedMarketsGrid`** | Production blotter in browser **or** OpenFin view | `componentName`, `defaultInstanceId`, provider id or picker | Yes (ancestor or `platform` prop) |

**Rule of thumb:** streaming market data → **`HostedMarketsGrid`** (simplest) or **`MarketsGridContainer`** (embedded in your layout). Static demos → **`MarketsGrid`** only.

---

## 2. Data hub prerequisite (streaming scenarios)

All provider-driven grids share the same runtime backbone:

```
App boot
  └─ ensurePlatformReady(config, { workerScriptUrl })
        ├─ Main-thread ConfigManager.init()     → IndexedDB (Dexie)
        ├─ SharedWorker spawn
        │     ├─ Worker ConfigManager.init()
        │     ├─ hydrateCatalog()               → ConfigCatalogCache
        │     └─ hydrateAppData()               → WorkerAppDataStore
        └─ wait: AppData mirror + catalog ready

React
  └─ DataHubProvider(platform)
        ├─ client        → MessagePort RPC
        ├─ appData       → AppData mirror ({{name.key}} templates)
        └─ configStore   → save/list provider rows (main thread)

Grid attach
  └─ attach(providerId)  cfg-free if id is in worker catalog
        └─ lazy ProviderSlot + STOMP/mock/rest upstream + row cache
```

Identity (`appId`, `userId`) is **deployment-wide** — from `public/app-config.json` (browser) or OpenFin manifest `customSettings`. Per-grid **`instanceId`** / **`gridId`** are separate (profiles, picker state).

---

## 3. Scenario catalog

| # | Scenario | Entry component | Hub | Example app |
|---|----------|-----------------|-----|-------------|
| A | **Minimal browser STOMP blotter** | `HostedMarketsGrid` | Yes | `apps/demos/stomp-marketsgrid-minimal` |
| B | **Browser STOMP + OpenFin option** | `HostedMarketsGrid` | Yes | `apps/demos/demo-stomp-markets-grid` |
| C | **Provider editor + dual grids** | `HostedMarketsGrid` ×2 | Yes | `apps/demos/dataprovider-editor` |
| D | **STOMP tutorial (workspace tarballs)** | `HostedMarketsGrid` | Yes | `apps/demos/stomp` |
| E | **OpenFin workspace blotter** | `HostedMarketsGrid` | Yes | `apps/demos/e2e-openfin-workspace` |
| F | **OpenFin production reference** | `HostedMarketsGrid` | Yes | `apps/demos/markets-ui-react-reference` |
| G | **E2E browser modes** | `HostedMarketsGrid` / standalone | Optional | `apps/demos/e2e-browser-blotter` |
| H | **Grid feature lab (static rows)** | `MarketsGrid` | No | `apps/demos/markets-grid-lab` |
| H2 | **Basic tutorial (localStorage)** | `MarketsGrid` | No | `apps/demos/basic` |
| I | **Mock provider + hub** | `HostedMarketsGrid` | Yes | `apps/demos/mockdata-provider` |
| J | **REST config service** | `HostedMarketsGrid` | Yes | `apps/demos/demo-configservice-react` |
| K | **Platform hooks (AppData + grid events)** | `MarketsGridContainer` | Yes | `apps/demos/platform-hooks-demo` |

---

## 4. Scenario A — Minimal browser STOMP blotter

**Goal:** smallest path from zero to live STOMP rows. No provider editor UI.

**Reference:** `apps/demos/stomp-marketsgrid-minimal`

### Boot sequence

1. `bootstrap()` → `resolvePlatformBootstrapFromJson` + `ensurePlatformReady`
2. `DataHubProvider(platform)` wraps the tree
3. `App` seeds catalog row via `configStore.save(stompProviderDraft)` (idempotent)
4. `HostedMarketsGrid` with `defaultLiveProviderId={providerId}` — **cfg-free attach**

### Minimal code shape

```tsx
// main.tsx — boot BEFORE render
void bootstrap().then(({ config, platform }) => {
  root.render(
    <DataHubProvider platform={platform} userId={config.userId}>
      <App />
    </DataHubProvider>,
  );
});

// App.tsx
<HostedMarketsGrid
  gridId="stomp-blotter"
  componentName="STOMP Positions"
  defaultInstanceId="stomp-blotter"
  defaultLiveProviderId={providerId}
  withStorage
  configManager={getPlatform().configManager}
/>
```

### Prerequisites

- STOMP broker: `npm run dev:stomp` (`ws://localhost:8081`)
- `public/app-config.json` with stable `appId` / `userId`
- Vite consumer config with `{ worker: true }`

### Dev tooling

- **Alt+Shift+S** — hub inspector (providers, subscribers, cache sizes, cfg JSON)
- **Alt+Shift+P** — provider toolbar (hidden by default in minimal app; grid still auto-attaches via `defaultLiveProviderId`)

---

## 5. Scenario B — Browser STOMP demo with chrome

**Goal:** same hub path as A, with optional OpenFin launch and richer demo shell.

**Reference:** `apps/demos/demo-stomp-markets-grid`

Same bootstrap + `HostedMarketsGrid` pattern. May include tabs, help copy, and `npm run openfin` for platform manifest testing.

---

## 6. Scenario C — Provider editor + multiple grids

**Goal:** author providers in UI; run two independent grids on one SharedWorker hub.

**Reference:** `apps/demos/dataprovider-editor`

### Layout pattern

```
DataHubProvider (one hub per appId)
  ├─ Dock layout
  │    ├─ HostedGridPanel A   gridId="grid-a"
  │    └─ HostedGridPanel B   gridId="grid-b"
  └─ DataProviderEditor       configStore.save → invalidate worker catalog
```

### Key behaviors

- **One hub, many subscribers:** each grid `attach(providerId)` adds a data listener; upstream STOMP/mock connection is **shared** per `providerId`.
- **Separate profiles:** each grid has its own `gridId` / `instanceId` → separate `gridLevelData` (picker selection + MarketsGrid profile).
- **Picker toolbar:** Alt+Shift+P reveals live/historical provider selection per grid.

### Embedded panel note

When `HostedMarketsGrid` sits inside a dock panel (not viewport root), wrap it in a positioned container so its internal `position: fixed` full-bleed layout pins to the **panel**, not the window. See `HostedGridPanel.tsx` in the tutorial app.

---

## 7. Scenario D — STOMP tutorial app

**Goal:** guided STOMP setup with help sheet and seeded provider utilities.

**Reference:** `apps/demos/stomp`, `apps/demos/stomp`

Uses `ensurePlatformReady` + `DataHubProvider` + `PositionsBlotter.tsx` rendering `HostedMarketsGrid`. Good middle ground between minimal and dataprovider-editor complexity.

---

## 8. Scenario E — OpenFin workspace view

**Goal:** MarketsGrid as an OpenFin **view** inside a workspace platform.

**Reference:** `apps/demos/e2e-openfin-workspace`

### Differences from plain browser

| Concern | Browser | OpenFin |
|---------|---------|---------|
| Bootstrap config | `public/app-config.json` | Manifest `customSettings.appId/userId` |
| `instanceId` | `defaultInstanceId` prop | View `customData.instanceId` (fallback to default) |
| ConfigManager | Explicit from `getPlatform()` | Often OpenFin singleton; pass override in tests |
| Workspace save | N/A | `HostedMarketsGrid` registers `workspace-saving` → flush grid profile |
| Tab strip / caption | N/A | `tabsHidden` + `caption` when platform hides tabs |

### Wiring (same hub pattern)

```tsx
void initPlatformBootstrap().then(({ config, platform }) => {
  root.render(
    <DataHubProvider platform={platform} userId={config.userId}>
      <Blotter />   {/* HostedMarketsGrid inside */}
    </DataHubProvider>,
  );
});
```

Manifest view URL typically includes `?view=blotter`. Platform provider view spawns with `customData.instanceId` per blotter instance.

---

## 9. Scenario F — Production OpenFin reference

**Goal:** full platform shell (dock, registry, config browser routes).

**Reference:** `apps/demos/markets-ui-react-reference`

Multiple routes render `HostedMarketsGrid` via thin view wrappers (`BlottersMarketsGrid.tsx`). Uses `ensurePlatformReady` + `DataHubProvider` at app root. Study this for multi-blotter production layouts.

---

## 10. Scenario G — E2E browser blotter modes

**Reference:** `apps/demos/e2e-browser-blotter`

| Mode | Grid wiring | Purpose |
|------|-------------|---------|
| `standalone` | In-app rows, no hub | Baseline UI without SharedWorker |
| `provider` / `config` / `full` | `HostedMarketsGrid` + hub | Integration / toolbar / config flows |

Useful when testing attach semantics (`data-status="wired"`) without OpenFin.

---

## 11. Scenario H — Feature lab (no hub)

**Goal:** exercise MarketsGrid modules (formatting, alerts, profiles, editing) with **static** `rowData`.

**Reference:** `apps/demos/markets-grid-lab`

```tsx
import { MarketsGrid } from '@wellsfargo-starui/grid';

<MarketsGrid
  gridId="lab-formatting"
  rowData={rows}
  columnDefs={cols}
  showFormattingToolbar
  storage={localStorageAdapter}
/>
```

**No** `DataHubProvider`, **no** `ensurePlatformReady`, **no** SharedWorker. Data never flows through the hub. Use for UI/feature development only — not for STOMP integration testing.

---

## 12. Scenario I — Mock provider + hub

**Goal:** synthetic streaming data without external broker.

**Reference:** `apps/demos/mockdata-provider`

Same hub bootstrap as STOMP scenarios. Provider `providerType: 'mock'` in catalog. `HostedMarketsGrid` or `MarketsGridContainer` attaches by id. Ideal for CI, demos offline, and e2e openfin-workspace mock provider.

---

## 13. Scenario J — REST config service

**Goal:** ConfigManager talks to remote REST API (Dexie as cache + pending sync queue).

**Reference:** `apps/demos/demo-configservice-react`

Set in bootstrap config:

```json
{
  "appId": "my-app",
  "userId": "dev1",
  "useRest": true,
  "configServiceRestUrl": "http://localhost:3001/api/v1"
}
```

Grids still use `DataHubProvider` + `HostedMarketsGrid`. Provider rows persist via REST; worker catalog hydrates from the same ConfigManager API on the worker side. Config Browser reads local Dexie cache on main thread.

---

## 14. Scenario K — Platform hooks (AppData bootstrap + grid events)

**Goal:** declarative AppData seeding at hub ready, plus persisted grid event callback bindings — without a STOMP broker.

**Reference:** `apps/demos/platform-hooks-demo` (port **5214**, `npm run dev:platform-hooks-demo`)

### Two hook tiers

| Tier | Config | Code | Persists |
|------|--------|------|----------|
| **AppData bootstrap** | `public/app-config.json` → `appDataBootstrap` | `appDataBootstrapHooks` map passed to `ensurePlatformReady` | AppData rows in IndexedDB |
| **Grid event callbacks** | `gridLevelData.eventBindings` (grid-level) | `gridEventHandlers` registry on `MarketsGridContainer` | Same blob as provider picker state |

JSON stores **stable handler ids only** — never executable code.

### Minimal wiring

```typescript
// bootstrap.ts
platform = await ensurePlatformReady(config, {
  workerScriptUrl: workerAssetUrl,
  appDataBootstrapHooks,
});

// App.tsx
<MarketsGridContainer
  gridEventHandlers={gridEventHandlers}
  handlerMeta={gridHandlerMeta}
  defaultLiveProviderId={liveId}
  …
/>
```

### Custom Settings UI

1. Toolbar **settings** (gear) opens the customizer drawer on **Grid Options** by default.
2. Use the **module dropdown** (top of drawer) → **Custom Settings**.
3. **Provider** section — live/historical pickers, refresh, reload.
4. **EVENT CALLBACKS** — one shadcn `Select` per catalog event; bindings save to `gridLevelData`.

See [`guides/platform-hooks-demo.md`](./archive/platform-hooks-demo.md) for the full checklist and event catalog.

**Compare:** `apps/demos/stomp-marketsgrid-minimal` now ships optional `gridEventHandlers` + `appDataBootstrap` stubs for console logging — same APIs, STOMP data path.

---

## 15. Provider attachment modes

### Recommended: cfg-free attach (catalog)

1. Save provider via `configStore.save()` (editor or programmatic seed).
2. Worker catalog reloads via `client.invalidateConfig()`.
3. Grid passes **`defaultLiveProviderId`** or user picks in toolbar.
4. Hub resolves transport cfg from `ConfigCatalogCache` — **no inline `cfg` on attach**.

### Legacy: inline cfg on attach

Pass full `ProviderConfig` on first attach when id is not in catalog. Deprecated for saved providers — use catalog + cfg-free attach.

### AppData templates

When cfg contains `{{positions.asOfDate}}`:

1. Values live in AppData rows (worker-persisted).
2. Main thread resolves via `useResolvedCfg` before attach.
3. Use `DataHubProvider mode="eager"` if first attach must wait for AppData snapshot.

---

## 16. Persistence & identity keys

| Key | Source | Stored in | Purpose |
|-----|--------|-----------|---------|
| `appId` | Bootstrap config | SharedWorker name | One hub per deployment |
| `userId` | Bootstrap config | Provider visibility, AppData ownership | Session user |
| `gridId` | Prop on grid | Profile namespace | Column layout, filters, modules |
| `instanceId` | OpenFin customData or `defaultInstanceId` | Storage adapter scope | Profile bundle key with appId/userId |
| `providerId` | ConfigManager row id | `appConfig` table | Hub catalog + attach target |

With `withStorage={true}`, `HostedMarketsGrid` builds a ConfigService-backed `StorageAdapterFactory` from `configManager`.

See [`PROFILE_PERSISTENCE.md`](./PROFILE_PERSISTENCE.md) for workspace-save timing and OpenFin Channel wiring.

---

## 17. Bootstrap placement patterns

### Pattern 1 — External boot (recommended for clarity)

```tsx
const { platform, config } = await bootstrap(); // ensurePlatformReady
<DataHubProvider platform={platform} userId={config.userId}>
  <App />
</DataHubProvider>
```

Used by: `stomp-marketsgrid-minimal`, `openfin-workspace`, `markets-grid-lab` (hub tabs only).

### Pattern 2 — Self-bootstrapping provider

```tsx
<DataHubProvider bootstrapConfig={config} workerScriptUrl={workerAssetUrl}>
  <App />
</DataHubProvider>
```

`ensurePlatformReady` runs inside the provider. Equivalent outcome; pick one style per app.

### Pattern 3 — Platform on HostedMarketsGrid

```tsx
<HostedMarketsGrid platform={platform} ... />
```

Mounts a **nested** `DataHubProvider`. Avoid double-wrapping if ancestor already provides hub context.

---

## 18. OpenFin vs browser checklist

### Browser app checklist

- [ ] `public/app-config.json` with `appId`, `userId`
- [ ] `vite.config` → `staruiConsumerViteConfig(..., { worker: true })`
- [ ] Worker asset: `@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url`
- [ ] `ensurePlatformReady` before render
- [ ] `DataHubProvider` wrapping grid tree
- [ ] Provider row in catalog (save or editor)
- [ ] `HostedMarketsGrid` with `defaultLiveProviderId` or picker
- [ ] STOMP broker running (if using STOMP)

### OpenFin app checklist

- [ ] Manifest `customSettings` matches bootstrap shape
- [ ] Platform provider initializes workspace
- [ ] View manifest URL + `customData.instanceId`
- [ ] Same hub bootstrap in view entry (`initPlatformBootstrap`)
- [ ] `HostedMarketsGrid` with `withStorage` + `configManager`
- [ ] Test workspace save flushes grid state

---

## 19. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Blank screen then grid | Normal while seeding `providerId` | Wait; check console |
| Grid stuck `loading` | Broker down / wrong WebSocket URL | `npm run dev:stomp`; verify `websocketUrl` |
| Empty grid, status `ready` | Wrong `keyColumn` vs row shape | Match provider `keyColumn` to STOMP JSON |
| Provider not found on attach | Catalog not invalidated after save | Ensure `configStore.save` completed; check hub inspector |
| Two tabs, stale provider list | Same `appId` — shared hub is correct | Expected; both share one upstream per providerId |
| Picker empty | No saved providers for user/subtype | Save via editor or programmatic seed |
| Profiles not saving | `withStorage` false or no configManager | Pass both props |
| OpenFin view wrong profile | `instanceId` collision | Unique `customData.instanceId` per view |

**Hub inspector (dev):** Alt+Shift+S on any `DataHubProvider` app in development.

---

## 20. Package imports cheat sheet

```typescript
// Grid primitive (static data)
import { MarketsGrid } from '@wellsfargo-starui/grid';

// Provider-aware container
import { MarketsGridContainer } from '@wellsfargo-starui/widgets-react';

// Production hosted shell (browser + OpenFin)
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';

// Hub bootstrap
import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
} from '@wellsfargo-starui/host-data';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';

// React hub context + hooks
import {
  DataHubProvider,
  useDataServices,
  useDataProvider,
  useUserIdFromContext,
} from '@wellsfargo-starui/host-data-react/runtime';
```

---

## 21. Choosing your starting template

| You want… | Start here |
|-----------|------------|
| Absolute minimum STOMP grid | `apps/demos/stomp-marketsgrid-minimal` |
| STOMP + narrative / OpenFin launch | `apps/demos/demo-stomp-markets-grid` |
| Learn provider editor + dual grids | `apps/demos/dataprovider-editor` |
| OpenFin view integration test | `apps/demos/e2e-openfin-workspace` |
| Full OpenFin platform reference | `apps/demos/markets-ui-react-reference` |
| Grid UI features without hub | `apps/demos/markets-grid-lab` |
| AppData bootstrap + grid event hooks (mock) | `apps/demos/platform-hooks-demo` |
| MCP scaffold from scratch | `@wellsfargo-starui/mcp-scaffold` templates `stomp`, `openfin-platform`, `dataprovider-editor` |

---

## 22. Grid customizer UI (settings drawer)

The toolbar **settings** icon opens a right-rail **Grid Customizer** drawer (`SettingsSheet`).

### Module navigation

- Opens on **Grid Options** (`general-settings`) by default.
- **Module dropdown** at the top switches panels: Grid Options, Style Rules, Column Settings, Custom Settings, Smart Edit, …
- Flat panels (Grid Options) use a **band sidebar** + scrollable field list; master-detail panels (Column Settings, Style Rules) use list + editor panes.

### Grid Options highlights

| Band | Notable settings |
|------|------------------|
| **ESSENTIALS** | Row/header height, `cellFlashDuration` / `cellFadeDuration` |
| **DEFAULT COLDEF → CELL CONTENT** | **FLASH ON CHANGE** toggle; when enabled, **FLASH COLOR** swatches (amber, emerald, rose, sky, …) tint AG-Grid's native `ag-cell-data-changed` flash |
| **SIDE BAR / STATUS BAR** | Tool-panel and status-panel visibility |

Flash colour maps to `--ag-value-change-value-highlight-background-color` per grid instance (theme-aware palette). Conditional styling **flash-on-match** rules are separate — they use CSS keyframe overlays, not this setting.

### Custom Settings (provider + events)

Available when `MarketsGridContainer` wires `providerGridHost`:

- Live / historical provider pickers, refresh, reload, edit provider
- **EVENT CALLBACKS** — bind catalog events to app handler ids (grid-level persistence)

Provider pickers moved out of the primary toolbar into this panel; the toolbar keeps refresh/reload admin actions and the settings entry point.

### Chrome stack

Toolbar, filter pills, formatter strip, and customizer controls use **shadcn/ui** primitives (`@wellsfargo-starui/ui`) themed via `@wellsfargo-starui/design-system` tokens — no native `<input>` / `<button>` in grid chrome.

Try it: `apps/demos/markets-grid-lab` (all modules) or enable flash colour under Grid Options → DEFAULT COLDEF on any hosted grid.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-28 | Initial comprehensive scenario guide |
| 2026-05-28 | Scenario K (platform hooks), customizer UI section, native flash colour swatches |
