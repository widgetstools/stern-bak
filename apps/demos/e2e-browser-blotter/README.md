# `@wellsfargo-starui/e2e-browser-blotter`

Single-page browser app whose only job is to be the canonical e2e
target for the Playwright suite. Tarball-deps (consumes published-style
`@wellsfargo-starui/*` bundles from `libs/*.tgz`) so what the tests cover is what
real consumers ship.

## URL modes

```
http://localhost:5180/?mode=standalone   # pure MarketsGrid + in-app generator (✓ wired)
http://localhost:5180/?mode=provider     # adds host-data SharedWorker provider (TODO)
http://localhost:5180/?mode=config       # adds ConfigService profile persistence (TODO)
http://localhost:5180/?mode=full         # everything (TODO; falls back to standalone)
```

Default = `full`. Specs that need a specific surface pass `?mode=...`
via `bootCleanBlotter(page, { mode: 'config' })` once those modes are
wired.

## v1 surface

Currently only the `standalone` mode is fully wired. The other modes
render the same surface with a banner showing `data-status="pending"`.
Each mode is filled in by a follow-up commit so specs can opt in
incrementally.

## Test hooks exposed on `window`

| Key | Type | Purpose |
|---|---|---|
| `__browserBlotterApi` | `GridApi` | The AG-Grid api. Set on first `onGridReady`. Playwright spec fast-path to query rows / trigger commands without UI traversal. |

## Layout

```
src/
  main.tsx        # entry; resolves ?mode= and mounts App
  App.tsx         # mode router + standalone surface (grid + ticker)
  globals.css     # tailwind base/components/utilities only
public/
  (empty for now)
```
