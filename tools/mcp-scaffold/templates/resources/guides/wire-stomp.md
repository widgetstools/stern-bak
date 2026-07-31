# How to wire STOMP to MarketsGrid

## Quick answer

Run `starui_setup_stomp_dev` then `starui_generate_stomp_config`.

## Steps

1. Scaffold **stomp** template (or add dataServices + HostedMarketsGrid).
2. Start **stomp-view-server**: `npm run dev:stomp` (port 8081).
3. Generate config: `starui_generate_stomp_config` with clientTag, dataType, keyColumn.
4. Seed provider: `ensureStompProvider()` on app boot.
5. Render **HostedMarketsGrid** with `dataServices`, `withStorage`, `theme="auto"`.
6. Open provider toolbar → select your STOMP provider.
7. Verify snapshot on `listenerTopic` then live deltas.

## Architecture

```
HostedMarketsGrid → dpClient → SharedWorker → StompTransport → ws://localhost:8081
```

AG Grid theme: `useGridTheme()` → `@wellsfargo-starui/design-system/adapters/ag-grid`.
