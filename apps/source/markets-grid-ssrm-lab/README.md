# MarketsGrid SSRM Lab

Clone of the [markets-grid-lab](../markets-grid-lab) shell focused on **SSRM only** — full MarketsGrid host chrome (toolbars, customizer, profiles, filters) with `rowModelType: 'serverSide'` via `HostedSsrmMarketsGrid` / the `ssrm` prop.

## Run

Requires the STOMP fixture broker on `ws://localhost:8081` (started automatically by `npm run app`).

From the platform repo root (feature branch with SSRM chrome):

```bash
npm run app -- markets-grid-ssrm-lab
```

Or:

```bash
cd apps && npm install   # once, after adding this workspace
npm run dev -w @wellsfargo-starui/markets-grid-ssrm-lab
```

Open **http://localhost:5320/**.

## What it mounts

- Lab-style header + theme toggle
- Seeds a deterministic `stomp-ssrm` catalog row (`markets-grid-ssrm-lab:positions-ssrm`)
- `HostedSsrmMarketsGrid` → `SsrmMarketsGridContainer` → full `MarketsGrid` with `ssrm={{ provider, … }}`

No CSRM `rowData` path. For the multi-tab CSRM feature lab, use `markets-grid-lab` on `:5300`.

## Related

- Design: `docs/superpowers/specs/2026-08-07-marketsgrid-ssrm-chrome-design.md`
- Minimal SSRM smoke: `stomp-marketsgrid-minimal/?ssrm=1` on `:5213`
