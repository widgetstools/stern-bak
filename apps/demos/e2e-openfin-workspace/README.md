# `@wellsfargo-starui/e2e-openfin-workspace`

The canonical OpenFin e2e target. Browser entry exists as a fallback
so the same code is usable for ad-hoc dev inspection at
`http://localhost:5181`.

## URL views

```
?view=provider   # OpenFin provider window — calls initWorkspace()
?view=blotter    # MarketsGrid blotter view (default outside OpenFin)
```

## v1 surface

Single view (`blotter`) wired with the same in-app 500-row × 50ms
ticker as `apps/demos/e2e-browser-blotter`. Provider window calls
`initWorkspace()` from `@wellsfargo-starui/openfin-platform` — that's enough to
bring up Home/Store/Dock/Notifications and validate the workspace
shell.

Pending — added by subsequent commits:
- DataProvider editor popout (right-click toolbar → "Edit provider")
- Workspace setup window (dock → setup)
- ConfigService-backed profile persistence
- Multi-view workspace save/restore round-trip specs

## Running

```bash
# Browser-only (fast iteration, no OpenFin runtime)
npm run dev:openfin-workspace
# → http://localhost:5181/?view=blotter

# Full OpenFin runtime (matches what e2e harness does)
npm run dev:openfin:openfin-workspace
# → launches OpenFin via tools/scripts/launch-openfin.mjs
# → manifest URL: http://localhost:5181/platform/manifest.fin.json
```

The dev manifest opens a visible provider window for inspection
(`autoShow: true`). The `manifest.e2e.fin.json` variant disables
autoShow and uses a different CDP port (9191 vs 9190) so the e2e
harness can run while a dev session is also live.

## Test hooks exposed on `window`

| Key | Type | Purpose |
|---|---|---|
| `__openfinWorkspaceApi` | `GridApi` | The AG-Grid api for the blotter view. Set on `onGridReady`. Playwright spec fast-path. |

## Manifest set

```
public/platform/
  manifest.fin.json        # dev manifest (CDP 9190, autoShow true)
  manifest.e2e.fin.json    # e2e manifest (CDP 9191, autoShow false)
public/views/
  blotter.fin.json         # view spec — fdc3 2.0, instanceId in customData
```

CDP ports chosen distinct from `apps/demos/markets-ui-react-reference`
(9090) so both can run concurrently when investigating regressions
against the old hybrid app.
