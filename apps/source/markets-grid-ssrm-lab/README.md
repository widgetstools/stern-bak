# MarketsGrid SSRM Lab

Full clone of [markets-grid-lab](../markets-grid-lab) (sidebar, feature tabs, inspector, profiles) with **SSRM only** — each tab mounts `MarketsGrid` with `ssrm={{ provider, keyColumn }}` against a SharedWorker `stomp-ssrm` plane instead of CSRM mock `rowData`.

## Run

```bash
cd /Users/develop/wfh/stern-bak/.worktrees/marketsgrid-ssrm-chrome
npm run app -- markets-grid-ssrm-lab
```

Open **http://127.0.0.1:5320/** (broker on `:8081` starts automatically).

## What’s different from CSRM lab

| | markets-grid-lab | markets-grid-ssrm-lab |
|--|------------------|------------------------|
| Shell | Feature sidebar + tabs | Same |
| Grid | `MarketsGrid` + `rowData` | `MarketsGrid` + `ssrm` |
| Data | Mock SharedWorker stream | STOMP SSRM (`ws://localhost:8081`) |
| Right rail | Demo console / scenarios | SSRM info rail |

Profile seeding, customizer, toolbars, and inspector docs are unchanged.
