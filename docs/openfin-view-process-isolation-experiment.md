# OpenFin per-view renderer isolation — what changed, why, how to revert, gotchas

Branch: `feature/openfin-view-process-isolation` (off `feature/worker-hub-config-refactor`)
Commits: `6375e51` (code + manifest + seed + tests), `6a11d68` (measurements in WORKLOG 21)
Date: 2026-09-13 · Runtime measured: OpenFin 43.142.101.2 · Status: **merged 2026-09-13 (558c789); switch on in the manifest; target-hardware decision per the refactor plan, Phase A**

Everything below was either changed in this branch, read in OpenFin's own
documentation (quoted, with links), or measured on the live dock. Nothing else.

---

## 1. The problem, in one paragraph

Six CSRM blotters (20 000 rows, 372 columns, ~5 000 patched rows a second each)
were docked as panes and tabs inside ONE OpenFin Browser window. All six views
ran in a single renderer process (one PID, 2.9 GB) and therefore shared one
main thread. Every view measured the same event-loop lag — 338 ms median at
first, 1.4–5.5 s later — visible grids painted at 4–5 frames per second, and
cell flashes stayed lit for seconds because their timers queued behind
everything else. In separate windows the same blotters were fine, because each
window got its own renderer. The cause was the process layout, not the data.

## 2. What "process affinity" is (OpenFin's words)

- Default: **"By default, a View will try to share the same renderer process as
  other Views owned by its parent Application. To change that behavior, see the
  processAffinity view option."** — [View | OpenFin JavaScript API](https://developer.openfin.co/docs/javascript/stable/classes/OpenFin.View.html)
- Per-view tag: **"String tag that attempts to group like-tagged renderers
  together. Will only be used if pages are on the same origin."** — [ViewOptions](https://developer.openfin.co/docs/javascript/stable/interfaces/OpenFin.ViewOptions.html)
- The caveat: **"However, there is no guarantee that a different affinity value
  will create a different process, under the hood Chromium can enforce its own
  process management under certain circumstances."** — [WindowOptions](https://cdn.openfin.co/docs/javascript/stable-v40/interfaces/OpenFin.WindowOptions.html)
- Platform-level switch: `viewProcessAffinityStrategy` — **"Strategy to assign
  views to process affinity by domain. `same` - The views in the same domain will
  have same renderer processes. `different` - The views in the same domain will
  have their own renderer processes."** — [PlatformOptions](https://developer.openfin.co/docs/javascript/stable/interfaces/OpenFin.PlatformOptions.html);
  OpenFin's knowledge-base example places it inside the manifest's `platform`
  section next to `defaultWindowOptions` — [Process Affinity – OpenFin](https://openfin.zendesk.com/hc/en-us/articles/21185348664980-Process-Affinity)
- Process model: **"There is typically one Renderer process per OpenFin
  Application, but it's possible to create more e.g. Views with
  processAffinity."** — [OpenFin Process Model](https://openfin.zendesk.com/hc/en-us/articles/360034808092-OpenFin-Process-Model)

In plain words: a view runs in a renderer process; same-app views normally share
one; a string tag groups views that carry the same tag; the platform switch
`"different"` asks for one renderer per same-origin view; Chromium may still
decide otherwise.

## 3. The changes, step by step

### Step 1 — manifest: ask for one renderer per view

File: `apps/source/star-demo/public/platform/manifest.fin.json`, inside `"platform"`,
right after `"providerUrl"`. Two keys were added (the comment key is just a
note; OpenFin ignores keys starting with `$comment`):

```json
"$comment-process-isolation": "EXPERIMENT (branch feature/openfin-view-process-isolation, WORKLOG 21): one renderer process per view. …",
"viewProcessAffinityStrategy": "different",
```

Why: this is OpenFin's documented switch for "each view gets its own renderer".
Nothing else in the manifest changed. The settings that keep hidden tabs alive
were already there and are unchanged:

- `platform.defaultViewOptions.backgroundThrottling: false` and
  `platform.defaultWindowOptions.backgroundThrottling: false`
- `runtime.arguments` include `--disable-background-timer-throttling
  --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
  --disable-features=IntensiveWakeUpThrottling,Freezing`

The manifest is read when the dock starts, and the production build copies it
from `public/` into `dist/platform/manifest.fin.json`. So a manifest change
needs `npm run build` in `apps/source/star-demo` (for the production preview)
and a dock restart (`npm run client`).

### Step 2 — seed: stop pinning every view to one group

File: `apps/source/star-demo/public/seed.json`. Three view definitions carried
`"processAffinity": "star-demo"` (the last property of their `componentState`,
after `"initialUrl"`). Those three lines were removed; nothing else in the seed
changed (the diff is 3 removed lines and 3 lines that lost a trailing comma).

Why: an explicit tag wins over the platform strategy. With the same tag on
every view, "different" would have changed nothing.

### Step 3 — platform code: strip persisted tags while the strategy is on

The seed is not the only place tags live. OpenFin saves each view's fully
resolved options into saved pages and workspaces, so layouts saved before this
change still carry `"processAffinity": "star-demo"` and would regroup the views
on restore. (This was observed: the workspace snapshot I saved from the live
dock contained the pin on every view.)

File: `packages/openfin/openfin-platform/src/stripLegacyViewIsolationAffinity.ts`
gained, at the end of the file:

| Added | What it does |
|---|---|
| `type ViewProcessAffinityStrategy = 'same' \| 'different'` | the manifest value |
| `interface ViewProcessAffinityPolicy { strategy?, sharedAffinity? }` | the decision inputs |
| `applyViewProcessAffinityPolicy(opts, policy)` | strategy `"different"` → **deletes any** `processAffinity` on the options object (shared tag, legacy `view-iso-*`, anything). No strategy or `"same"` → calls the existing `stripLegacyViewIsolationAffinity`, which normalises legacy `view-iso-*` values and — since the 2026-09-13 fix, see §5 C and gotcha 13 — the bare-uuid affinities the runtime stamps while the strategy is `"different"`; readable explicit tags are left alone. Mutates and returns `opts`. |
| `applyViewProcessAffinityPolicyToLayout(layout, policy)` | same rule walked over a layout tree: every node, its `componentState`, and each child in `content`. Without `"different"` it calls the existing legacy walk. Tolerates `null` and non-objects. |

File: `packages/openfin/openfin-platform/src/workspacePersistence.ts` (the platform
provider override that OpenFin calls for every view and window creation):

1. The import now brings in the two new functions and types instead of the two
   legacy ones.
2. New private members on `MarketsUIWorkspaceProvider`:
   - `affinityStrategy()` reads the manifest **once** with
     `fin.Application.getCurrentSync().getManifest()` and returns
     `platform.viewProcessAffinityStrategy` if it is `'different'` or `'same'`,
     otherwise `undefined`. The promise is cached. If `fin.Application` is not
     available or the read throws, it returns `undefined` — the legacy behaviour.
   - `affinityPolicy()` pairs that with `legacySharedAffinity()` (the platform
     uuid, unchanged).
3. `createView(payload)` now calls
   `applyViewProcessAffinityPolicy(payload.opts, await this.affinityPolicy())`
   where it used to call the legacy strip, then `disableBackgroundThrottling`
   exactly as before.
4. `createWindow(payload)` now calls `applyViewProcessAffinityPolicyToLayout` on
   `payload.layout` and on `payload.windowOptions.layout` where it used to call
   the legacy layout walk, then the throttling overrides exactly as before.
5. The long comment above the class keeps its original warning and gains a
   paragraph explaining this experiment.

Why this shape: with no strategy in the manifest, the code path is the old one
byte-for-byte in behaviour, so the code can stay even if the manifest line is
removed.

### Step 4 — tests

- `stripLegacyViewIsolationAffinity.test.ts`: five new tests — `"different"`
  strips shared and legacy tags and leaves other options alone; no strategy
  falls back to the legacy cleanup; `"same"` leaves explicit tags alone; the
  layout walk under `"different"` clears every persisted tag in a tree and
  tolerates `null`; the layout walk without a strategy is the legacy walk.
- `workspacePersistence.test.ts`: one new test — with a stub `fin` whose
  manifest says `"different"`, `createView` strips `processAffinity: 'plat'`
  (and still forces `backgroundThrottling: false`), and `createWindow` strips a
  shared tag in `layout` and a legacy tag in `windowOptions.layout`.
- The existing tests, which stub `fin` without `Application`, still exercise
  the legacy path unchanged. Result: 45 tests pass in the two files; the
  openfin package typechecks.

### Step 5 — docs

`docs/WORKLOG.md` item 21 (diagnosis, measurements, next steps) and one bullet
in `docs/current-features.md` describing the new policy functions.

### Step 6 — how it was built and measured

1. `npx turbo build --filter=@wellsfargo-starui/openfin` (the override lives in
   this package's dist), then `npm run build` in `apps/source/star-demo`
   (bundles the package and copies manifest + seed into `dist/`).
2. Quit the dock and relaunch with `npm run client` (manifest is read at start).
3. Opened one platform window holding the six CSRM blotters as four panes and
   two tabs (`createWindow` with a `layout`), waited for them to load, then
   read process info with `fin.View.getProcessInfo()` from the provider page,
   measured event-loop lag and frame gaps in every view for 10 s, and checked
   hidden tabs with a 100 ms interval injected over the DevTools protocol.

## 4. What was measured

Same six CSRM blotters, docked as four panes + two tabs in one window:

| | shared renderer (before) | one renderer per view (this branch) |
|---|---|---|
| renderer processes | 1 (2.9 GB) | 6 (505–644 MB each, ≈3.4 GB) |
| event-loop lag per view p50 / p95 / max | 338 / 737 / 778 ms, later 1.4–5.5 s | 0 / 96–153 / 150–226 ms |
| frame gap on visible views p50 / p95 | 200–250 / 350–800 ms (4–5 fps) | 17 / 67 ms (60 fps) |
| long tasks per view per 10 s | 2–6 (thread saturated by many short tasks) | 12–22, 0.9–2.0 s total |
| hidden tabs | on the saturated thread | 100 ms interval fired 70–73 of 80 times; lag ≤ 180 ms; still processing updates |

OpenFin stamped a distinct affinity value per view and every view had its own
PID. Chromium did not consolidate on this machine during the run (16 renderer
processes were alive at one point). Per-view memory is roughly 15 % above the
view's share of the old single process. The earlier, reverted per-view
experiment recorded in `docs/archive/openfin-process-isolation.md` measured one
4.7 GB process against about eleven 200 MB processes.

## 5. How to revert

There are three levels, from lightest to heaviest.

**A. Switch it off, keep the code.** Remove the two added keys from the
manifest (`$comment-process-isolation` and `viewProcessAffinityStrategy`),
rebuild star-demo (`npm run build` in `apps/source/star-demo`, or nothing for
`vite dev`, which serves `public/` directly), and restart the dock. With no
strategy in the manifest the new code takes the legacy path, so views go back
to OpenFin's default grouping. Optionally restore the three seed pins
(`git checkout feature/worker-hub-config-refactor -- apps/source/star-demo/public/seed.json`);
without them seeded views simply use OpenFin's default "share with the parent
Application", which is the same one-renderer outcome the pin produced.

**B. Revert the commits on the branch.**
`git revert 6a11d68 6375e51` (docs first, then code) — or just don't merge the
branch; the base branch `feature/worker-hub-config-refactor` never had these
changes.

**C. What about layouts saved while the experiment was on?** They carry the
isolation with them, and this was measured the hard way on 2026-09-13
(runtime 43.142.101.2, Windows 11): while the strategy is `"different"` the
runtime stamps every view's options with a fresh uuid `processAffinity`
(`view.getOptions()` shows it, and it is a new value after every relaunch), and
`Platform.getSnapshot()` persists it in each view's `componentState` — 36 of 36
views in the saved layout had one. Restored on a manifest without the strategy,
those uuids were honoured: the first isolation-off run of the refactor plan's
§7.2 came up with 13 renderer processes for 13 views, the same uuids as before.
The restore-time cleanup (`stripLegacyViewIsolationAffinity`) now treats a
bare-uuid affinity like a legacy `view-iso-*` one and normalises it to the shared
per-app group, so switching the key off also switches restored layouts back. No
data migration is needed; a layout self-heals on its next restore. Verified the
same day with the fix built in: the same saved layout, key removed, restored
into one shared renderer (2 PIDs for 13 views — the 12 blotters together plus
find-in-page). Until that fix is built into the app you run, level A alone does
not switch isolation off for restored layouts — check with run 1 of the plan's
§7.2 (one renderer PID for the blotters).

## 6. Gotchas — read before relying on this

1. **It is a request, not a guarantee.** OpenFin: "no guarantee that a
   different affinity value will create a different process, under the hood
   Chromium can enforce its own process management under certain
   circumstances." Re-measure on the target hardware (RAM, core count) before
   assuming six processes; on this machine it held.
2. **Same origin only.** Affinity "will only be used if pages are on the same
   origin". All blotters here are `http://localhost:5175`, so it applied.
3. **Any explicit tag regroups views.** A `processAffinity` string on a view
   overrides the platform strategy for that view. Tags hide in three places:
   the seed, saved pages/workspaces (OpenFin persists resolved options), and
   any code that stamps one. The seed was cleaned and the override strips the
   rest; if a new code path creates views without going through the platform
   provider, check it.
4. **`createView` is the choke point that actually protects you.** The layout
   walk only sees `payload.layout` and `windowOptions.layout`. OpenFin
   workspace windows also carry `layoutSnapshot.layouts[...]`; when a snapshot
   was applied whose views still had the tag, the views nevertheless came up
   with distinct affinities. On 2026-09-13 a probe showed why that proves less
   than it seems: a view created through `Platform.createView` with an explicit
   `processAffinity: "starui-probe-tag"` under `"different"` still came back
   with a runtime uuid affinity and its own PID — on this runtime the strategy
   wins over an explicit tag anyway. So in the ON direction the strip is belt
   and braces; it is the OFF direction (gotcha 13) where the cleanup matters.
   None of this is a documented guarantee.
5. **Snapshots restore from `layoutSnapshot`, not `layout`.** Editing
   `window.layout.content` in a saved snapshot and re-applying it was ignored;
   the window restored its `layoutSnapshot` views. To open a specific docked
   arrangement programmatically use `Platform.createWindow({ layout })`.
6. **Manifest changes need a build and a restart.** The manifest is copied into
   `dist/` by the star-demo build and read once when the dock starts.
7. **Memory scales with views.** Each isolated CSRM view was 505–644 MB here;
   plan for roughly 15 % more than the shared process for the same views, and
   linear growth with view count. Chromium may consolidate processes under
   memory pressure (gotcha 1).
8. **Hidden views and the earlier revert.** Per-view processes were tried and
   reverted once because hidden views went blank; that turned out to be
   Chromium freezing hidden view contents regardless of process, and it is
   handled by `backgroundThrottling: false` (manifest defaults, re-forced on
   every created view because saved layouts carry `true`) plus the
   `--disable-…` runtime arguments. Keep all of those; with them, hidden tabs
   in this experiment kept their timers and kept processing updates.
9. **Views, not windows.** `viewProcessAffinityStrategy` is a view setting.
   The popout code in `packages/openfin/host-openfin/src/popoutWindow.ts`
   deliberately sets no window-level `processAffinity` because the popout
   relies on sharing the main window's process for same-origin DOM access
   through `getWebWindow()` (its comment cites OpenFin's "Windows within the
   same application share a renderer process by default"). Do not add window
   affinities without re-testing popouts.
10. **Isolation buys cores, not less work.** Each view still spends 0.9–2.0 s
    per 10 s on AG Grid's per-row update path (two timers per updated row via
    `rowNodeDataChanged`, measured at ~190 000 `setTimeout` calls per 10 s per
    view before this change). That cost is now on its own core per view; the
    apply-path change in WORKLOG 21 is what shrinks it.
11. **Startup is heavier.** Six isolated views loading at once each replay
    their 20 000-row snapshot in their own process; the first seconds after a
    restore are busier than before, and one 2.5 s frame gap was seen right
    after the docked window opened.
12. **Reading Task Manager.** With isolation, per-view CPU shows per process;
    without it one process near 100 % of one core with low total CPU is the
    signature of the shared-thread problem.
13. **The runtime writes its uuid affinity into your saved layouts.** Under
    `"different"` every view's resolved options carry a bare-uuid
    `processAffinity`, and `getSnapshot()` / saved pages / saved workspaces
    keep it. Remove the manifest key and restore such a layout, and you are
    still isolated (measured: 13 PIDs for 13 views, same uuids). The cleanup in
    `stripLegacyViewIsolationAffinity.ts` therefore treats a uuid-shaped
    affinity as an isolation artefact when the strategy is off (verified: with
    the fix built in the same layout restored into one shared renderer). If
    you copy the policy into another platform, copy that rule too, and always
    confirm the OFF state with a process map, never by reading the manifest.
    The same-day comparison on 12 docked CSRM views, Windows 11: shared
    renderer private 3 346 MB, visible views 39–40 fps with lag p95
    197–221 ms; isolated 12 × 250–406 MB private (+15 %), 60 fps, p95
    4.9–13.5 ms.
14. **`view.getOptions().backgroundThrottling` is not a measurement.** On
    43.142.101.2 a view created with `backgroundThrottling: false` reads back
    `true` (probe 2026-09-13: both `false` and `true` were asked, both reported
    `true`), and every docked view reports `true` although the override forces
    `false`. Judge throttling by liveness — plan §7.2 run 2, hidden tabs firing
    80 of 80 timer ticks — never by the reported option.

## 7. What this experiment did NOT verify

- Behaviour under memory pressure or on a smaller machine (gotcha 1).
- Popouts and the provider/dock windows were not re-tested after the change
  (they are windows, not views, and were not touched).
- My "cells changed while hidden" probe reported false for visible grids too,
  so it was broken; hidden-tab liveness rests on the timer cadence and
  long-task counts, which are unambiguous.
- Whether OpenFin versions other than 43.142.101.2 honour the strategy
  identically (the API docs consulted were the stable / v40 / v45 pages).

## 8. Files touched on the branch

```
apps/source/star-demo/public/platform/manifest.fin.json   (+2 lines)
apps/source/star-demo/public/seed.json                     (3 pins removed)
packages/openfin/openfin-platform/src/stripLegacyViewIsolationAffinity.ts        (+55)
packages/openfin/openfin-platform/src/stripLegacyViewIsolationAffinity.test.ts   (+48)
packages/openfin/openfin-platform/src/workspacePersistence.ts                    (+42/-8)
packages/openfin/openfin-platform/src/workspacePersistence.test.ts               (+19)
docs/WORKLOG.md, docs/current-features.md
```
