# marketsgrid-container-e2e

A deliberately bare-bones host for **`MarketsGridContainer`** (via
`HostedMarketsGrid`) backed by a **static mock data provider** — built to be a
**deterministic e2e target** for the provider-host + customizer surface.

Why it exists: the shared root e2e suite drives several heavy Vite `dev:source`
servers with 4 parallel workers, which makes the customizer / profile specs
flaky under contention. And demo-react mounts **bare `<MarketsGrid>`**, so it
never exercises the `MarketsGridContainer` provider-host path at all. This app
mounts that path with one mock-backed grid, one server, one worker.

## What it mounts

- `HostedMarketsGrid` with `gridId="mock-blotter"`, `withStorage` + a
  local-mode `ConfigManager` (Dexie), and `showFiltersToolbar` /
  `showFormattingToolbar` / `showEditingToolbar` so the customizer is reachable.
- Two `mock` provider catalog rows (`Mock Positions A` / `B`) seeded on load
  (`src/mockProvider.ts`). `enableUpdates: false` → a fixed snapshot with no
  ticking, so grid content is stable. Two providers give the Custom Settings
  picker something to switch between (the save-and-switch path).

## Run

```bash
# app only
npm --prefix apps run dev -w @wellsfargo-starui/marketsgrid-container-e2e

# the e2e suite (isolated config: only this server, 1 worker)
npx playwright test -c playwright.container.config.ts
```

Specs live in the repo's `e2e/` dir as `container-*.spec.ts` (so they resolve
the root `@playwright/test`). The config starts only port 5215.

## Note on dev:source resolution

`@wellsfargo-starui/grid` is consumed as **source**; `@wellsfargo-starui/widgets-react` (where
`MarketsGridContainer` lives) resolves to its **dist**. So changes to the
container require `npm run build --workspace=@wellsfargo-starui/widgets-react` before the
app reflects them — the e2e config does not rebuild for you.
