# STOMP SSRM + MarketsGrid — two-grid demo

Two `HostedSsrmMarketsGrid` instances share one `stomp-ssrm` catalog row (one STOMP session, one SharedWorker WASM cache) and apply independent grouping.

## Run

```bash
npm run app -- stomp-ssrm-minimal
```

Starts `stomp-view-server` on `ws://localhost:8081` and the demo on `:5214`.

Wire destinations match the CSRM demo (`TRADER001`, snapshot end token `Success`).
