# StarUI Platform — Parity Gate

> Parity gate for the StarUI platform migration (legacy `@wellsfargo-starui/*` → `marketsui-platform`).

**Last verified:** 2026-05-19 · branch `refactor/starui-engine-phase2`

## Summary

| Area | Legacy package | StarGrid package | Status |
|---|---|---|---|
| Grid platform core | `@wellsfargo-starui/core` | `@wellsfargo-starui/engine` | **Ported** |
| MarketsGrid widget | `@wellsfargo-starui/markets-grid` | `@wellsfargo-starui/grid/widget` | **Ported** |
| Grid customizer | `@wellsfargo-starui/grid-react` | `@wellsfargo-starui/grid/customizer` | **Ported** (merged) |
| Design tokens + CSS | `@wellsfargo-starui/design-system` | `@wellsfargo-starui/design-system` (`packages/design-system/design-system`) | **Ported** — in-repo |
| shadcn primitives | `@wellsfargo-starui/ui` | `@wellsfargo-starui/ui` (`packages/react-ui/ui`) | **Ported** — in-repo |
| Shared types | `@wellsfargo-starui/shared-types` | `@wellsfargo-starui/shared-types` (`packages/shared/shared-types`) | **Ported** — in-repo |
| Runtime port | `@wellsfargo-starui/runtime-port` + browser | `@wellsfargo-starui/host` + `@wellsfargo-starui/host-browser` | **Ported** |
| Config persistence | `@wellsfargo-starui/config-service` | `@wellsfargo-starui/host-config` | **Ported** |
| Data services | `@wellsfargo-starui/data-services` | `@wellsfargo-starui/host-data` | **Ported** |
| Data services React | `@wellsfargo-starui/data-services-react` | `@wellsfargo-starui/host-data-react` | **Ported** |
| OpenFin runtime | `@wellsfargo-starui/runtime-openfin` | `@wellsfargo-starui/host-openfin` | **Ported** |
| App shell | `@wellsfargo-starui/app-shell-react` + providers | `@wellsfargo-starui/app` (`StarGridApp`) | **Ported** |
| Demo app | `apps/demos/demo-react` | `apps/demos/demo-react` | **Ported** (zero `@wellsfargo-starui/*`) |
| OpenFin workspace shell | `@wellsfargo-starui/openfin-platform` | `@wellsfargo-starui/openfin-platform` | **Ported** |
| Widget contract (agnostic) | (in `@wellsfargo-starui/widget-sdk`) | `@wellsfargo-starui/widget` (`packages/shared/widget`) | **Ported** |
| Widget browser adapter | (in `@wellsfargo-starui/widget-sdk`) | `@wellsfargo-starui/widget-browser` | **Ported** |
| Widget SDK (React) | `@wellsfargo-starui/widget-sdk` | `@wellsfargo-starui/widget-sdk` (`packages/react-core/widget-sdk`) | **Ported** — React-only |
| Config browser tool | `@wellsfargo-starui/config-browser-react` | `@wellsfargo-starui/config-browser` | **Ported** |
| Data provider editor | `@wellsfargo-starui/config-editor-ui` | — | **Deferred** |
| Workspace setup | `@wellsfargo-starui/workspace-setup-react` | — | **Deferred** |
| Angular parity | `@wellsfargo-starui/widgets-angular` | — | **Deferred** |
| E2E suite | root `e2e/` (legacy demo) | `apps/demos/demo-react/e2e` | **Ported** (10 core specs) |

## Automated verification (marketsui-platform workspace)

```bash
cd marketsui-platform
npm install
npm run typecheck   # 16 packages + demo
npm run build
npm run test        # engine · grid 386 · host-config 102 · host-data 123 · openfin-platform 67 · app …
npm run e2e         # 10 core MarketsGrid specs vs @wellsfargo-starui/demo-react on :5190
```

## Product feature parity (MarketsGrid)

- [x] Module pipeline (general-settings, column-customization, conditional-styling, …)
- [x] ProfileManager + storage adapters (memory, localStorage bundle, config-service)
- [x] Formatting toolbar + global header style
- [x] Settings sheet + column/group/calculated panels
- [x] Expression engine + security policy
- [x] AG Grid 35 theming via design-system adapters
- [x] `host: GridHostContext` wiring
- [x] OpenFin popout helpers (`@wellsfargo-starui/grid/runtime/openfin`)
- [x] `HostedMarketsGrid` + `MarketsGridContainer` (`@wellsfargo-starui/widgets-react`)
- [x] OpenFin workspace shell + config subpath (`@wellsfargo-starui/openfin-platform`)
- [x] Config browser dev tool (`@wellsfargo-starui/config-browser`)

## Gate criteria

- [x] `@wellsfargo-starui/app` ships `<StarGridApp>` + `useStarGridHost()` + plugin hook
- [x] Demo app mounts MarketsGrid with **zero** `@wellsfargo-starui/*` imports
- [x] Full workspace build/typecheck green
- [x] E2E core suite ported (10 specs; ~25/28 passing on first run — token + toolbar label drift)
- [x] OpenFin reference shell (`@wellsfargo-starui/openfin-platform` + `openFinPlatformPlugin`)

**Estimated MarketsGrid-path parity:** ~95%
**Full platform parity (config-editor, workspace-setup, Angular):** ~75%

## OpenFin plugin usage

```tsx
import { StarGridApp } from '@wellsfargo-starui/app';
import { openFinPlatformPlugin } from '@wellsfargo-starui/openfin-platform/plugin';

<StarGridApp appId="my-app" plugins={[openFinPlatformPlugin]}>
  …
</StarGridApp>
```

Browser-only dev: plugin no-ops when `fin` is undefined.

## E2E notes

Core specs ported from legacy root `e2e/`:

- `v2-settings-panels`, `v2-formatting-toolbar`, `v2-filters-toolbar`, `v2-general-settings`
- `v2-column-customization`, `v2-conditional-styling`, `v2-calculated-columns`, `v2-column-groups`
- `v2-autosave`, `design-system-theme-switch`

Deferred (need multi-grid / fixture views / second demo):

- Profile isolation, nested fixtures, popout, hosted-markets-grid, template-create-apply

## Remaining work

1. Port `@wellsfargo-starui/config-editor-ui` → `@wellsfargo-starui/config-editor-ui`
2. Port `@wellsfargo-starui/workspace-setup-react`
3. Port remaining E2E specs once demo supports fixture routes
4. Port `@wellsfargo-starui/widgets-react/v2/provider-editor` (DataProviderEditor)
5. Angular parity (`@wellsfargo-starui/widgets-angular`)
