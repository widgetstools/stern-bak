# STOMP + MarketsGrid demo

Minimal reference app showing how little code is needed to wire a **programmatic STOMP data provider** to **MarketsGrid** via the hub `IDataProvider` path:

1. `initPlatformBootstrap()` — SharedWorker hub + ConfigManager (`platformBootstrap.ts`)
2. `ensureStompProvider()` — save STOMP cfg to catalog (`ensureStompProvider.ts`)
3. `<HostedMarketsGrid defaultLiveProviderId={id} />` — cfg-free attach (`StompMarketsGridDemo.tsx`)

See `src/StompMarketsGridDemo.tsx` for the full grid wiring (~50 lines).

## Prerequisites

```bash
# Terminal 1 — mock STOMP broker (port 8081)
npm run dev:stomp
```

## Browser

```bash
npm run dev:demo-stomp-markets-grid
# → http://localhost:5210
```

### Styling / theming

This app uses the same CSS stack as `tutorials-workspace/stomp` and `demo-react`:

- `@wellsfargo-starui/design-system/css` — `--ds-*` tokens + shadcn HSL channels
- `@wellsfargo-starui/grid/styles.css` — primary toolbar + filter chrome (`.ds-*`)
- `@wellsfargo-starui/design-system/tailwind` preset — shadcn/Tailwind classes for grid customizer controls
- Formatter toolbar CSS ships with `@wellsfargo-starui/grid` (`.fx-*`, loaded when the toolbar opens)

If the grid looks unstyled (plain white boxes, missing toolbar chrome), stop the dev server and restart with the npm script above (it sets `STARUI_DEV_SOURCE=1`), then hard-refresh the browser. Tailwind config changes are not picked up by Vite HMR alone.

### Grid customizer

Open toolbar **settings** (gear) to reach **Grid Options** (row sizing, native cell flash + colour swatches, side bar, …). Switch the module dropdown to **Custom Settings** for provider pickers when using `MarketsGridContainer`; this demo uses `HostedMarketsGrid` with a fixed `defaultLiveProviderId`.

For AppData bootstrap and grid event callback patterns without STOMP, see [`apps/demos/platform-hooks-demo`](../platform-hooks-demo/README.md).

## OpenFin

```bash
# Terminal 2 — Vite + launch OpenFin platform
npm run dev:openfin:demo-stomp-markets-grid
```

Or manually:

```bash
npm run dev:demo-stomp-markets-grid -- --no-open
node apps/demos/demo-stomp-markets-grid/launch.mjs
# manifest: http://localhost:5210/platform/manifest.fin.json
```

Open the **STOMP Positions** view from the workspace Home/Store, or spawn the blotter view directly via `public/views/blotter.fin.json`.

## Files

| File | Role |
|------|------|
| `src/platformBootstrap.ts` | Web `app-config.json` or OpenFin manifest identity |
| `src/providers/positionsStomp.ts` | STOMP provider draft |
| `src/ensureStompProvider.ts` | Programmatic catalog seed |
| `src/StompMarketsGridDemo.tsx` | Grid surface |
| `launch.mjs` | OpenFin launcher (delegates to `tools/scripts/launch-openfin.mjs`) |
| `public/platform/manifest.fin.json` | OpenFin platform manifest |

## Further reading

- [MarketsGrid Usage Guide](../../docs/MARKETSGRID_USAGE_GUIDE.md) — Scenario B
- [STOMP DataProvider guide](../../docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md)
