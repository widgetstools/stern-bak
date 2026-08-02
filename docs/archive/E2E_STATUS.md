# E2E status

Snapshot of the Playwright end-to-end suites: what exists, how it's wired,
and how to capture a fresh pass/fail baseline. Referenced from
[`CLAUDE.md`](../../CLAUDE.md). Update the inventory whenever specs are added,
removed, or re-pointed, and re-capture the pass/fail counts after a full
local run (see [Capturing a baseline](#capturing-a-baseline)).

_Last inventory: 2026-06-13._

## Suites at a glance

| Suite | Config | Collected tests | Spec files | Runner |
|---|---|---|---|---|
| Main | [`playwright.config.ts`](../../playwright.config.ts) | **398** | 51 | `npm run e2e` |
| Container | [`playwright.container.config.ts`](../../playwright.container.config.ts) | **16** | 5 (`container-*.spec.ts`) | `npm run e2e:container` |
| OpenFin | [`e2e-openfin/playwright.config.ts`](../../e2e-openfin/playwright.config.ts) | 4 spec files | 4 | `npm run e2e:openfin` (OpenFin runtime only) |

The main config sets `testIgnore: 'container-*.spec.ts'`, so the 53 spec
files under `e2e/` split into **48 main + 5 container**. Counts above are
what `playwright test --list` collects, the authoritative figure (a single
spec file can hold many `test()` blocks).

> Counts are collection counts, not pass counts. Capture pass/fail from a
> real run — the multi-server topology below means a snapshot taken with a
> stale dev server or an un-booted port is not representative.

## Server topology (main suite)

The main suite boots **seven** dev servers via `webServer`, all in
`dev:source` mode (Vite aliases `@wellsfargo-starui/*` to `packages/` source — except
`@wellsfargo-starui/widgets-react`, consumed from its built `dist/`, so it is rebuilt
in the relevant `webServer` commands). `reuseExistingServer` is `true`, so a
**stale server left running on one of these ports will be reused without a
rebuild** — kill stragglers before a clean run.

| Port | App | Notes |
|---|---|---|
| 5190 | `@wellsfargo-starui/demo-react` | primary app under test (`baseURL`) |
| 5191 | `@wellsfargo-starui/demo-configservice-react` | ConfigService storage round-trips |
| 5174 | `@wellsfargo-starui/markets-ui-react-reference` | reference views |
| 5180 | `@wellsfargo-starui/e2e-browser-blotter` | browser blotter smoke |
| 5300 | `@wellsfargo-starui/markets-grid-lab` | grid source (`--force` clobbers stale `.vite/deps`) |
| 5214 | `@wellsfargo-starui/platform-hooks-demo` | builds `host-data` + `widgets-react` first |
| 5213 | `@wellsfargo-starui/stomp-marketsgrid-minimal` | builds `widgets-react` first (editor Columns tab) |

The container suite uses its own single mock host on **:5215** with one
worker.

## Spec inventory (main suite)

Grouped by area; every file lives under `e2e/`.

**Grid customizer — toolbars, panels, profiles (`v2-*`):**
`v2-autosave`, `v2-settings-panels`, `v2-general-settings`,
`v2-column-customization`, `v2-column-groups`, `v2-nested-column-groups`,
`v2-column-templates`, `v2-template-create-apply`, `v2-column-value-getter`,
`v2-calculated-columns`, `v2-nested-calculated-columns`,
`v2-expression-editor`, `v2-conditional-styling`,
`v2-nested-conditional-styling`, `v2-filters-toolbar`,
`v2-formatting-toolbar`, `v2-nested-formatter`, `v2-nested-kitchen-sink`,
`v2-editing`, `v2-editing-family`, `v2-smart-edit`, `v2-bulk-update`,
`v2-plus-minus`, `v2-row-exclusion`, `v2-cell-renderer`, `v2-edit-history`,
`v2-shortcuts`, `v2-alerts`, `v2-two-grid-isolation`,
`v2-profile-lifecycle`, `v2-profile-stress`,
`v2-profile-isolation-structure`, `v2-profile-isolation-styling`,
`v2-popout-window`, `v2-popout-toolbar`, `v2-popout-design-system`,
`v2-perf`, `v2-window-focus-restore`.

**Design system:** `design-system-smoke`, `design-system-theme-switch`.

**Data / hub / provider:** `browser-blotter`, `hosted-markets-grid`,
`stale-data-disconnect`, `grid-console-health`, `reference-cell-flash`,
`grid-options-status-bar-toggle`, `config-seed-roundtrip`.

**Platform / visual:** `platform-hooks-demo`, `visual-reference-capture`.

**Container suite (`container-*`):** `container-smoke`,
`container-customizer-panels`, `container-provider-selection`,
`container-save-and-switch`, `container-config-service`.

## Known-fragile / pre-existing failures

These are environment- or drift-sensitive and should be triaged before
trusting a red result:

- **Server-boot timeouts** (e.g. `browser-blotter` `page.goto` on :5180):
  almost always a dev server that hadn't finished its first compile, or a
  port reused from a stale process. Re-run after confirming all seven ports
  are freshly served.
- **`design-system-theme-switch`** asserts a literal hex background
  (`#0b0d10`); the design tokens now resolve to `oklch(...)`, so this
  assertion drifts. Update the spec to compare resolved colors rather than a
  hardcoded hex when next touching the theme.
- **Stale `widgets-react` `dist/`**: any app consumed from `dist`
  (`platform-hooks-demo`, `stomp-marketsgrid-minimal`) fails its Vite
  dep-scan if `widgets-react` hasn't been rebuilt after a source change
  (`npm run build --workspace=@wellsfargo-starui/widgets-react`). The `webServer`
  commands rebuild it, but only when the server is actually (re)started.

## Capturing a baseline

```bash
# 0. Kill any stale dev servers on the suite's ports first.
# 1. Build the packages consumed from dist:
npm run build --workspace=@wellsfargo-starui/host-data
npm run build --workspace=@wellsfargo-starui/widgets-react

# 2. Main suite (boots its own seven servers):
npm run e2e -- --reporter=line

# 3. Container suite (separate config + mock host on :5215):
npm run e2e:container -- --reporter=line
```

Record the resulting `N passed / M failed` here and update the baseline in
[`CLAUDE.md`](../../CLAUDE.md) in the same change. Per repo policy, never commit
`test.skip` / `test.fixme` / `.only` — fix, delete, or harden a failing spec
instead (see [`e2e/README.md`](../../e2e/README.md)).
