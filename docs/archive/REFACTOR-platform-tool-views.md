# Refactor: Platform tool views (Config Browser, Data Providers, Rename Tab)

> **Status:** Planned — not started  
> **Created:** 2026-06-09  
> **Estimated effort:** 1–2 focused PRs  
> **Trigger:** Duplicate app-level route views in `star-demo` and `markets-ui-react-reference`; layering smell (`RenameViewTab` imports `@wellsfargo-starui/grid/customizer` for non-grid UI).

## Goal

Move OpenFin/browser **tool-window React views** from demo apps into the correct **react-core** packages so consumers only wire router paths — not copy 80–180 line view files.

Apps keep **route registration** (`/config-browser`, `/dataproviders`, `/rename-view-tab`). Package exports own the **view components** and stable URL contracts.

## Non-goals

- **Not `@wellsfargo-starui/grid`.** These are platform shell tools, not MarketsGrid product surface. Do not add them to `packages/react-grid/`.
- **Not `@wellsfargo-starui/openfin-platform` React UI.** That package stays vanilla TS (workspace init, `openChildToolWindow`, custom actions). It already opens the URLs; it should not gain a React peer for popout bodies.
- **No change to OpenFin URL paths** — `@wellsfargo-starui/openfin-platform` hard-codes `/config-browser`, `/dataproviders`, `/rename-view-tab`. Route paths in apps must stay aligned.
- **No mandatory router inside packages** — export plain components; apps choose `react-router` lazy routes.

---

## Problem today

### Duplicated app views

| File | `star-demo` | `markets-ui-react-reference` | Lines (approx.) |
|------|-------------|------------------------------|-----------------|
| `src/views/ConfigBrowser.tsx` | ✓ | ✓ (identical) | 6 |
| `src/views/DataProviders.tsx` | ✓ | ✓ (identical) | 79 |
| `src/views/RenameViewTab.tsx` | ✓ | ✓ (identical) | 179 |

Both apps also register the same lazy imports in:

- `src/main.tsx` — `React.lazy(() => import("./views/…"))`
- `src/platform/Provider.tsx` — OpenFin provider route map

### What already exists in packages

| Capability | Package | Export today |
|------------|---------|--------------|
| Config browser UI | `@wellsfargo-starui/config-browser` | `ConfigBrowserPanel` |
| In-grid config browser shell | `@wellsfargo-starui/widgets-react` | `ConfigBrowserDialog` (internal to markets-grid-container) |
| Provider editor form | `@wellsfargo-starui/widgets-react/v2/provider-editor` | `DataProviderEditor`, `useProviderProbe`, … |
| Open child window at path | `@wellsfargo-starui/openfin-platform` | `openChildToolWindow`, `openDataProvidersToolWindow` |
| Rename tab action + URL | `@wellsfargo-starui/openfin-platform` | `createRenameViewTabAction`, `RENAME_VIEW_TAB_WINDOW_NAME`, path `/rename-view-tab` |

The **gap** is route-level shells (full-window layout, popout body reset, URL `?id=` wiring, OpenFin `fin.me` customData) — not the core widgets.

### Layering issue

`RenameViewTab.tsx` imports `Button` and `Input` from `@wellsfargo-starui/grid/customizer`. That UI has no grid dependency; refactor must switch to `@wellsfargo-starui/ui`.

---

## Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│  App (star-demo, markets-ui-react-reference, MCP templates) │
│  — BrowserRouter routes only                                │
│  — <Route path="/config-browser" element={<ConfigBrowserView />} /> │
└────────────────────────────┬────────────────────────────────┘
                             │ imports
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
@wellsfargo-starui/config-browser   @wellsfargo-starui/widgets-react    @wellsfargo-starui/widgets-react
ConfigBrowserView        /v2/provider-editor       /hosted
                         DataProviderEditorPage    RenameViewTabView
```

| View | Target package | Proposed export | Subpath |
|------|----------------|-----------------|---------|
| Config browser full-page | `@wellsfargo-starui/config-browser` | `ConfigBrowserView` | `.` |
| Data providers editor page | `@wellsfargo-starui/widgets-react` | `DataProviderEditorPage` | `./v2/provider-editor` |
| Rename view tab popout | `@wellsfargo-starui/widgets-react` | `RenameViewTabView` | `./hosted` |

**Why `./hosted` for rename:** OpenFin view lifecycle + `fin.*` integration already lives in `widgets-react/hosted` (`useHostedView`, `useOpenFinChannel`, …). Rename tab is workspace chrome, not provider editing.

---

## Proposed public APIs

### 1. `ConfigBrowserView` — `@wellsfargo-starui/config-browser`

Thin full-page wrapper around existing `ConfigBrowserPanel`.

```tsx
/** Zero-config route view for /config-browser popouts. */
export function ConfigBrowserView(): JSX.Element;
```

- **Behavior:** Render `<ConfigBrowserPanel />` full viewport (optional `className` / `style` props if needed for popout chrome).
- **Deps:** Already has `@wellsfargo-starui/ui`, `@wellsfargo-starui/grid` peer — no new deps.
- **Today’s app equivalent:** 6-line `views/ConfigBrowser.tsx`.

### 2. `DataProviderEditorPage` — `@wellsfargo-starui/widgets-react/v2/provider-editor`

Full-window shell for the provider editor popout.

```tsx
export interface DataProviderEditorPageProps {
  /** Defaults to LOGGED_IN_USER_ID or bootstrap context when omitted. */
  userId?: string;
  /** Read ?id= from location when true (default). Set false to manage id yourself. */
  readProviderIdFromSearchParams?: boolean;
  /** Optional back link target (default `/`). Omit to hide header back link. */
  backTo?: string;
  /** Document title while mounted (default `Data Providers · Markets UI`). */
  documentTitle?: string;
}

export function DataProviderEditorPage(props?: DataProviderEditorPageProps): JSX.Element;
```

- **Behavior (preserve from current `DataProviders.tsx`):**
  - `useSearchParams()` → `initialProviderId` for `DataProviderEditor`
  - `document.title` set/restore on mount/unmount
  - Body `padding` / `margin` / `overflow` reset on mount (popout flush layout; restore on unmount)
  - Header: optional back link + user/storage hint
- **Deps:** Add `react-router-dom` as **optional peer** (`peerDependenciesMeta.optional: true`) OR accept `initialProviderId` only and drop router dep — prefer optional peer so apps with router get `?id=` for free.
- **Alternative:** Export `useDataProviderEditorPageLayout()` hook + unstyled shell; page component composes hook + `DataProviderEditor`. Only worth it if a second layout is needed.

### 3. `RenameViewTabView` — `@wellsfargo-starui/widgets-react/hosted`

Frameless popout for “Save Tab As…” (pairs with `createRenameViewTabAction`).

```tsx
export function RenameViewTabView(): JSX.Element;
```

- **Behavior (preserve from current `RenameViewTab.tsx`):**
  - Read `customData.view` + `customData.currentTitle` from `fin.me.getOptions()`
  - Input autofocus/select; Enter save, Escape cancel
  - Save: `target.executeJavaScript(\`document.title = …\`)` + persist `customData.savedTitle` on target view
  - Close current window on save/cancel
  - Guard when `!isOpenFin` (render nothing or minimal fallback)
- **UI:** `@wellsfargo-starui/ui` `Button` + `Input` (remove `@wellsfargo-starui/grid/customizer` import).
- **Constants:** Re-export or document linkage to `@wellsfargo-starui/openfin-platform` `ACTION_RENAME_VIEW_TAB`, `RENAME_VIEW_TAB_WINDOW_NAME`, path `/rename-view-tab`.

---

## URL contract (do not break)

| Path | OpenFin window name | Opened by |
|------|---------------------|-----------|
| `/config-browser` | `config-browser` | Dock Tools, `ACTION_OPEN_CONFIG_BROWSER`, grid admin |
| `/dataproviders` | `data-providers` | `openDataProvidersToolWindow`, dock, `?id=` for row select |
| `/rename-view-tab` | `rename-view-tab` | `createRenameViewTabAction` (frameless popout) |

Source of truth: `packages/openfin/openfin-platform/src/openChildToolWindow.ts`, `internal/viewTabRename.ts`, `workspace.ts`, `internal/customActions.ts`.

---

## Implementation plan

### PR 1 — Package exports + migrate reference apps

- [ ] **config-browser:** Add `ConfigBrowserView.tsx`; export from `src/index.ts`.
- [ ] **widgets-react/provider-editor:** Add `DataProviderEditorPage.tsx`; export from `v2/provider-editor/index.ts`; optional `react-router-dom` peer.
- [ ] **widgets-react/hosted:** Add `RenameViewTabView.tsx`; export from `hosted/index.ts`; use `@wellsfargo-starui/ui` primitives.
- [ ] **star-demo:** Delete `src/views/ConfigBrowser.tsx`, `DataProviders.tsx`, `RenameViewTab.tsx`; update `main.tsx` + `platform/Provider.tsx` lazy imports to package exports.
- [ ] **markets-ui-react-reference:** Same deletion/migration.
- [ ] **docs/current-features.md** — add the three public view exports under the correct package sections.
- [ ] **docs/MARKETSGRID_USAGE_GUIDE.md** (or platform bootstrap guide) — one paragraph: “register these three routes from package exports.”

### PR 2 (optional) — MCP templates + remaining consumers

- [ ] **tools/mcp-scaffold** OpenFin / platform templates — emit route wiring importing package views instead of scaffolding view files.
- [ ] Grep `apps/demos/**` for any other copies of these views.
- [ ] Vitest smoke: `RenameViewTabView` logic with mocked `fin`; `DataProviderEditorPage` body-style reset (jsdom).

---

## App migration snippet (target end state)

```tsx
// main.tsx — star-demo / markets-ui-react-reference
import { ConfigBrowserView } from '@wellsfargo-starui/config-browser';
import { DataProviderEditorPage } from '@wellsfargo-starui/widgets-react/v2/provider-editor';
import { RenameViewTabView } from '@wellsfargo-starui/widgets-react/hosted';

<Route path="/dataproviders" element={<DataProviderEditorPage />} />
<Route path="/config-browser" element={<ConfigBrowserView />} />
<Route path="/rename-view-tab" element={<RenameViewTabView />} />
```

Lazy loading can wrap package exports the same way as today:

```tsx
const ConfigBrowser = React.lazy(() =>
  import('@wellsfargo-starui/config-browser').then((m) => ({ default: m.ConfigBrowserView })),
);
```

---

## Acceptance criteria

- [ ] No `views/ConfigBrowser.tsx`, `views/DataProviders.tsx`, or `views/RenameViewTab.tsx` under `star-demo` or `markets-ui-react-reference`.
- [ ] OpenFin dock Tools → Config Browser, Data Providers, and view-tab “Save Tab As…” still work unchanged.
- [ ] `openDataProvidersToolWindow({ providerId })` still selects the row via `?id=`.
- [ ] `RenameViewTabView` uses `@wellsfargo-starui/ui`, not `@wellsfargo-starui/grid/customizer`.
- [ ] `npx turbo typecheck build test` green.
- [ ] `docs/current-features.md` lists the new exports with correct package attribution (per [Public vs internal](../current-features.md#public-vs-internal)).

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `react-router-dom` required in provider-editor page | Optional peer; props allow `initialProviderId` without router |
| Popout body-style reset affects other routes | Keep reset scoped to `DataProviderEditorPage` mount lifecycle (unchanged behavior) |
| `fin` global in hosted rename view | Match existing pattern (`declare const fin`); test with mock |
| Package bundle size | Views are small; lazy route imports in apps unchanged |

---

## Related docs & code

- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — bucket import rules (why not react-grid / openfin-platform React)
- [`docs/current-features.md`](../current-features.md) — `@wellsfargo-starui/config-browser`, `@wellsfargo-starui/widgets-react`, `@wellsfargo-starui/openfin-platform` §7.2
- [`docs/guides/platform-bootstrap-config.md`](../guides/platform-bootstrap-config.md) — app bootstrap
- `packages/openfin/openfin-platform/src/openChildToolWindow.ts`
- `packages/openfin/openfin-platform/src/internal/viewTabRename.ts`
- `packages/react-core/widgets-react/src/v2/markets-grid-container/ConfigBrowserDialog.tsx` — in-dialog pattern (orthogonal to full-page view)

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-09 | Do **not** place views in `@wellsfargo-starui/grid` | Grid bucket = MarketsGrid + customizer only |
| 2026-06-09 | Rename view → `@wellsfargo-starui/widgets-react/hosted` | OpenFin hosted integration already lives there |
| 2026-06-09 | Keep URL paths app-owned, components package-owned | `openfin-platform` already hard-codes paths; apps must register matching routes |
