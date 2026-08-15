# Package Reference

The platform ships **seven packages**, one per architecture bucket. Every
package is an ordinary npm package — external consumers install them under
their real names with no aliases and no build glue.

| Package | Bucket path | Role |
|---|---|---|
| [`@wellsfargo-starui/types`](#wellsfargo-staruitypes) | `packages/types` | foundation contracts |
| [`@wellsfargo-starui/design-system`](#wellsfargo-staruidesign-system) | `packages/design-system` | tokens, themes, icons |
| [`@wellsfargo-starui/core`](#wellsfargo-staruicore) | `packages/core` | vanilla-TS runtime |
| [`@wellsfargo-starui/data`](#wellsfargo-staruidata) | `packages/data` | SharedWorker data services |
| [`@wellsfargo-starui/openfin`](#wellsfargo-staruiopenfin) | `packages/openfin` | OpenFin workspace shell |
| [`@wellsfargo-starui/react`](#wellsfargo-staruireact) | `packages/react-core` | React primitives + SDK |
| [`@wellsfargo-starui/grid`](#wellsfargo-staruigrid) | `packages/react-grid` | MarketsGrid product surface |

Layering and allowed imports are covered in
[architecture.md](./architecture.md#1-layer-model).

---

## `@wellsfargo-starui/types`

Foundation types — host-port identity/theme/surface contracts and the
shared data-provider/config contracts. Depends on nothing.

| Subpath | Contents |
|---|---|
| `.` | host-port contracts (re-exports the shared set) |
| `./shared` | shared framework types — the single source of truth |
| `./shared/configuration` | configuration shapes |
| `./shared/dataProvider` | data-provider contracts |
| `./shared/fieldSelector` | field-selector contracts |

---

## `@wellsfargo-starui/design-system`

The design system: primitives, semantic tokens, themes, framework adapters and
framework-agnostic SVG icons. Every visual property in the platform resolves
through its `--bn-*` / `--fi-*` CSS variables; themes switch by flipping
`data-theme="dark" | "light"` on `<html>`.

| Subpath | Contents |
|---|---|
| `.` | JS token access + theme helpers (root barrel) |
| `./apply-theme` | `applyTheme` / `getTheme` — THE theme writer, dependency-light for plain-`tsc` consumers |
| `./css`, `./styles.css`, `./reset.css` | built theme CSS (`./styles.css` is the one-import stylesheet for external apps; `./reset.css` is opt-in preflight) |
| `./tokens`, `./tokens/primitives`, `./tokens/semantic`, `./tokens/components`, `./tokens/controls` | token tree, by tier |
| `./tailwind` | Tailwind preset wired to the tokens |
| `./adapters/ag-grid` | AG Grid theme adapter (`staruiGridTheme`, mode-switched by `data-ag-theme-mode`) |
| `./cell-renderers`, `./cell-renderers-registry` | token-driven cell renderers |
| `./icons`, `./icons/react`, `./icons/all-icons`, `./icons/svg/*` | icon set (curated Lucide re-exports + `DynamicIcon` + raw SVG) |

Peers: `react` (icon adapter), `tailwindcss`, `ag-grid-community`.

---

## `@wellsfargo-starui/core`

Framework-agnostic core runtime: the vanilla-TS grid engine (GridPlatform,
modules, expression engine, profiles) and host ports with a browser adapter
and a Dexie (IndexedDB) config store.

| Subpath | Contents |
|---|---|
| `.` | grid engine + shared runtime (curated barrel — every export has an external consumer) |
| `./host` | host port contracts (`RuntimePort`, `toolSurfaces`) |
| `./host/browser` | browser host adapter (`BrowserRuntime`) |
| `./host/config` | Dexie-backed config store (`ConfigManager`, seed/deploy export) |

Deps: `@wellsfargo-starui/design-system`, `@wellsfargo-starui/types`, `dexie`,
`ssf`, `zustand`. Peer: `ag-grid-community`.

---

## `@wellsfargo-starui/data`

SharedWorker-backed data services: one upstream STOMP connection fanned out to
every grid in every window, with snapshot + thin-delta frames. See
[architecture.md § data services](./architecture.md#5-data-services).

| Subpath | Contents |
|---|---|
| `.` | data-services API |
| `./runtime` | runtime shared pieces (hub client, providers, AppData mirror) |
| `./runtime/client` | per-window client |
| `./ssrm-engine` | transport-agnostic SSRM query/aggregation engine (see [ssrm-engine.md](./ssrm-engine.md)) |
| `./assets/data-services-worker.mjs` | prebuilt worker bundle (build-generated) |

Deps: `@stomp/stompjs`.

---

## `@wellsfargo-starui/openfin`

The OpenFin workspace shell — dock, notifications, child tool windows,
config import/export — plus the contained OpenFin seams every other package
uses. **The only package allowed to import `@openfin/core`.**

| Subpath | Contents |
|---|---|
| `.` | workspace shell (`initWorkspace` + its callable pieces, registry config) |
| `./host` | the OpenFin seams: `isOpenFin`, IAB/interop/identity helpers, `OpenFinRuntime` (RuntimePort), `openOpenFinPopout` |
| `./config` | side-effect-free config entry (safe in a plain browser; ConfigManager wiring, IAB topics, action ids) |
| `./dock-editor` | dock layout editor helpers |
| `./test-bridge` | e2e test bridge (IAB channel, dev-only) |

Peers: `@openfin/core`, `@openfin/workspace`, `@openfin/workspace-platform`.

---

## `@wellsfargo-starui/react`

The React layer: shadcn/Radix UI primitives, workspace setup, and the React
data bindings (including `createStarui`, the one-call bootstrap).

| Subpath | Contents |
|---|---|
| `.` | UI primitives (Button, Dialog, Select, …) |
| `./chart` | chart components (Recharts-based) |
| `./tailwind-config` | app-side Tailwind wiring |
| `./workspace-setup` | workspace bootstrap for React apps |
| `./data/runtime` | React bindings for the data services — `createStarui`, `StaruiIdentityProvider`, `useAppData`, provider hooks |

Peers: `react`, `react-dom`, `tailwindcss`, `@tanstack/react-query`.

---

## `@wellsfargo-starui/grid`

The product surface: **StarGrid** (the one consumer-facing grid) over
**MarketsGrid** (the internal opinionated, profile-persistent AG Grid host),
the grid customizer, the config browser, and the provider editor.

| Subpath | Contents |
|---|---|
| `.` | `MarketsGrid`, toolbars, storage helpers, `ensureAgGridModules`, types |
| `./customizer` | curated customizer surface (14 names; `ExpressionEditor`, state types) |
| `./styles.css` | grid chrome CSS |
| `./config-browser` | configuration browser panel |
| `./widgets` | `StarGrid` + container widgets |
| `./widgets/ssrm-markets-grid-container` | SSRM container |
| `./widgets/provider-editor` | data-provider editor |
| `./widgets/hosted` | hosted-integration hooks (`useHostedStarui`, workspace-save flush, grid linking) |

Peers: `react`, `react-dom`, `ag-grid-community`, `ag-grid-enterprise`,
`ag-grid-react`, `@tanstack/react-query`.

---

## Versioning & dependency policy

- Pins follow the **stable line** per major (React 19.2.x, `@openfin/core`
  43.101.x) — not latest-patch drift.
- Framework libraries are **peer dependencies**: the consuming app owns React,
  AG Grid, OpenFin and Tailwind versions.
- Lockfiles are **not committed** — environments behind different registries
  regenerate their own; reproducibility rests on the version pins.
