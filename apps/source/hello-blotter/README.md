# hello-blotter — the north-star app

A live 20,000-row SSRM blotter in **one 27-line file** and two starui
import specifiers. This is the reference shape for a new StarUI app:
`createStarui()` boots the platform (SharedWorker data hub, provider
catalog seeding, storage, identity) and `<StarGrid>` renders the grid,
inferring SSRM mode from the provider's `stomp-ssrm` type.

## Run

From the platform repo root (starts the STOMP fixture feed on :8081, then
the app on :5177):

```bash
npm run app -- hello-blotter
```

Or by hand:

```bash
cd apps/source/stomp-view-server && npm run dev   # the feed, :8081
cd apps/source/hello-blotter && npm run dev       # the app,  :5177
```

Open http://localhost:5177 — the grid fills with a 20k-row snapshot and
ticks live updates. Columns are inferred from the feed; no `columnDefs`
are declared anywhere.

## Files

| File | What |
|---|---|
| `src/main.tsx` | the whole app — `createStarui` + `<StarGrid>` (27 lines) |
| `src/index.css` | design-system tokens + grid chrome (2 imports) |
| `index.html` | `<html data-theme="dark">` + the root div |
| `vite.config.ts` | shared consumer Vite config (`{ worker: true }` for the SharedWorker) |

## What the provider config means

```
websocketUrl:   ws://localhost:8081                the STOMP broker
listenerTopic:  /snapshot/positions/trd1           subscribe here
requestMessage: /snapshot/positions/trd1/1000/10   client trd1, 1000 row-updates/sec, batches of 10
snapshotEndToken: Success                          feed's snapshot-complete marker
keyColumn:      positionId                         row identity (cache + getRowId)
publishWindowMs: 200                               SSRM tick conflation window
```

Full field reference: [`docs/latest/provider-config.md`](../../../docs/latest/provider-config.md).

## Guarded by e2e

[`apps/e2e/hello-blotter.spec.ts`](../../e2e/hello-blotter.spec.ts) boots
the app, waits for rows, asserts inferred columns, scrolls the viewport,
and requires a live tick — it self-skips when the feed (:8081) is down.
