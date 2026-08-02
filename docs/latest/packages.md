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

Foundation types — host-port identity/theme/surface contracts plus the shared
widget-framework types. Depends on nothing.

| Subpath | Contents |
|---|---|
| `.` | host-port and widget contracts |
| `./shared` | shared framework types |
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
| `.` | `applyTheme`, `getTheme`, JS token access |
| `./css`, `./styles.css`, `./reset.css` | built theme CSS |
| `./tokens`, `./tokens/primitives`, `./tokens/semantic`, `./tokens/components`, `./tokens/controls` | token tree, by tier |
| `./tailwind` | Tailwind preset wired to the tokens |
| `./shadcn` | shadcn/ui theme layer |
| `./primeng` | PrimeNG (Angular) theme |
| `./adapters/ag-grid` | AG Grid theme adapter |
| `./cell-renderers`, `./cell-renderers-registry` | token-driven cell renderers |
| `./icons`, `./icons/react`, `./icons/angular`, `./icons/all-icons`, `./icons/svg/*` | icon set, per framework and raw SVG |

Peers: `react` (icon adapter), `tailwindcss`, `ag-grid-community`.

---

## `@wellsfargo-starui/core`

Framework-agnostic core runtime: the vanilla-TS grid engine, host ports with a
browser adapter and a Dexie (IndexedDB) config store, and the widget
framework.

| Subpath | Contents |
|---|---|
| `.` | grid engine + shared runtime |
| `./host` | host port contracts |
| `./host/browser` | browser host adapter |
| `./host/config` | Dexie-backed config store |
| `./widget` | widget framework |
| `./widget/browser` | browser widget adapter |

Deps: `dexie`, `ssf`, `zustand`. Peer: `ag-grid-community`.

---

## `@wellsfargo-starui/data`

SharedWorker-backed data services: one upstream STOMP connection fanned out to
every grid in every window, with snapshot + thin-delta frames. See
[architecture.md § data services](./architecture.md#5-data-services).

| Subpath | Contents |
|---|---|
| `.` | data-services API |
| `./runtime` | runtime shared pieces |
| `./runtime/sharedWorker` | SharedWorker bootstrap |
| `./runtime/client` | per-window client |
| `./runtime/worker/defaultEntry` | worker entry for custom bundling |
| `./assets/data-services-worker.mjs` | prebuilt worker bundle (build-generated) |

Deps: `@stomp/stompjs`.

---

## `@wellsfargo-starui/openfin`

OpenFin RuntimePort plugin plus the workspace shell — dock, home,
notifications, child windows, and config import/export. **The only package
allowed to import `@openfin/core`.**

| Subpath | Contents |
|---|---|
| `.` | public API |
| `./host` | workspace shell host |
| `./config` | config import/export |
| `./plugin` | RuntimePort plugin |
| `./dock-editor` | dock layout editor |
| `./test-bridge` | e2e test bridge |

Peers: `@openfin/core`, `@openfin/workspace`, `@openfin/workspace-platform`.

---

## `@wellsfargo-starui/react`

The React layer: shadcn/Radix UI primitives, the widget SDK, the React host
wrapper, workspace setup, and React data bindings.

| Subpath | Contents |
|---|---|
| `.` | UI primitives (Button, Dialog, Select, …) |
| `./chart` | chart components (Recharts-based) |
| `./tailwind-config` | app-side Tailwind wiring |
| `./widget-sdk` | React widget SDK |
| `./host`, `./host/test-bridge` | React host wrapper |
| `./workspace-setup` | workspace bootstrap for React apps |
| `./data`, `./data/runtime` | React bindings for the data services |

Peers: `react`, `react-dom`, `tailwindcss`, `@tanstack/react-query`.

---

## `@wellsfargo-starui/grid`

The product surface: **MarketsGrid** (an opinionated, profile-persistent AG
Grid host), the grid customizer, the config browser, and the widget catalog.

| Subpath | Contents |
|---|---|
| `.` | `MarketsGrid`, toolbars, storage helpers, types |
| `./customizer` | grid customizer (column settings, formatting, alerts, …) |
| `./styles.css`, `./styles/core.css`, `./styles/chrome.css` | grid chrome CSS layers |
| `./runtime/openfin` | OpenFin glue for grid widgets |
| `./config-browser`, `./config-browser/icons` | configuration browser |
| `./widgets`, `./widgets/*` | packaged widgets (markets-grid-container, provider-editor, data-provider-selector, hosted) |

Peers: `react`, `react-dom`, `ag-grid-community`, `ag-grid-enterprise`,
`ag-grid-react`, `@tanstack/react-query`.

---

## The excluded package

`packages/data/host-data-angular` is the one remaining Angular package. It is
**excluded from the pipeline** — not in the root workspaces, skipped by
packing and consumer-tsconfig generation. It stays kebab-cased per the Angular
Style Guide and is recoverable history, not an active surface.

## Versioning & dependency policy

- Pins follow the **stable line** per major (React 19.2.x, `@openfin/core`
  43.101.x) — not latest-patch drift.
- Framework libraries are **peer dependencies**: the consuming app owns React,
  AG Grid, OpenFin and Tailwind versions.
- Lockfiles are **not committed** — environments behind different registries
  regenerate their own; reproducibility rests on the version pins.
