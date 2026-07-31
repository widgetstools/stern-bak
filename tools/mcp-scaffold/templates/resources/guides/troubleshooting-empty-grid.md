# Empty grid troubleshooting

## Quick answer

**"Why is my grid empty?"** — Run `starui_diagnose_data_plane` on your project directory.

## Common causes

1. **No provider selected** — Press Alt+Shift+P (Cmd+Shift+P on Mac) and pick a live provider.
2. **STOMP server not running** — `npm run dev:stomp` → http://localhost:8081/health
3. **SharedWorker disabled** — `vite.config` needs `{ worker: true }`.
4. **Missing DataServicesProvider** — Wrap app in `<DataServicesProvider services={dataServices}>`.
5. **Snapshot not finished** — Wait for `Success` token before live rows appear.
6. **Wrong keyColumn** — Must match JSON identity field from STOMP messages.
7. **Basic template** — Uses static `rowData`; no provider needed.

## Tools

- `starui_diagnose_data_plane` — automated checklist
- `starui_setup_stomp_dev` — STOMP dev environment
- `starui_test_stomp_connection` — health + WebSocket probe
