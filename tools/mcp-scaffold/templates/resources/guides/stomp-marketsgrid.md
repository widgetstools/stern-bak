# STOMP + MarketsGrid integration

1. Scaffold `stomp` template or add `HostedMarketsGrid` + `dataServices`.
2. Start `stomp-view-server` on port 8081.
3. Seed provider with `ensureStompProvider()`.
4. Wrap app in `DataServicesProvider`.
5. Select provider via grid toolbar (Alt+Shift+P).

Use `starui_diagnose_data_plane` when the grid stays empty.
