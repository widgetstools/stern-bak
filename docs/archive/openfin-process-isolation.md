# OpenFin per-view renderer process isolation — REVERTED

> ## ⚠️ This change was reverted. Do not reintroduce it as described here.
>
> **Shipped** 2026-07-29 (`691cbfe7`, branch `perf/newenhancements`) ·
> **reverted** 2026-07-29 on the same branch.
>
> Giving every view its own renderer process delivered the CPU and memory
> wins measured below, but broke the background lifecycle. A view alone in
> its renderer has nothing visible sharing that process, so Chromium
> throttles it and then freezes it once the view is hidden, occluded, or
> merely inactive for a while. Observed: OpenFin windows not painting after
> being hidden or inactive, blotters frozen, grid content lost.
>
> Sharing a renderer with visible content is what keeps a hidden view
> scheduled. That is the mechanism the default grouping relies on, and it is
> why `"processAffinity": "star-demo"` in `seed.json` — called out as part of
> the problem below — was actually load-bearing.
>
> `viewProcessIsolation.ts`, its test, and the `createView` / `createWindow`
> override hooks in `workspacePersistence.ts` are deleted. The seed is back on
> the shared affinity and the manifest carries no scheduler-override flags.
>
> **The diagnostic content below is kept deliberately** — the "sluggish UI at
> low aggregate CPU" signature and the per-process measurement technique are
> still correct and still worth reaching for. What is *not* correct is the
> conclusion that per-view affinity is a usable fix. Any future attempt has to
> solve the background-freeze half first (e.g. keeping a hidden view's renderer
> scheduled, or accepting a repaint-on-restore path), and must be tested by
> leaving a blotter hidden for several minutes before restoring it.
>
> **Legacy cleanup (required by the revert):** pages/workspaces SAVED while the
> experiment was live carry the stamped `view-iso-…` affinities inside their
> persisted layouts, so restoring them kept re-creating solo renderers (and the
> blank-inactive-tab freeze) after the revert — confirmed live via CDP:
> restored views still reported `processAffinity: "view-iso-<uuid>"`, and one
> frozen view didn't answer the debugger at all.
> `stripLegacyViewIsolationAffinity.ts` normalizes any `view-iso-*` affinity
> back to the shared per-app group (platform uuid) in the platform's
> `createView` / `createWindow` restore paths, so contaminated snapshots
> self-heal on their next restore. Non-legacy affinities pass through
> untouched.
>
> **Second correction (same day):** the freeze proved to be
> **per-WebContents, not per-process**. After a clean rebuild with shared
> affinities, all blotter views still froze while the window was backgrounded
> (CDP `Runtime.evaluate` stopped answering in every view). "Sharing a
> renderer with visible content keeps hidden views scheduled" — the revert's
> original rationale — is wrong: Chromium freezes a hidden view's page
> regardless of process cohabitation. The working fix is OpenFin's
> per-contents `backgroundThrottling: false` in the app manifest's
> `defaultViewOptions` / `defaultWindowOptions` (star-demo carries it).
> The isolation revert itself remains correct for its cost reasons.

## TL;DR (as originally written — outcome superseded by the notice above)

Every OpenFin platform view now gets its **own Chromium renderer process**,
enforced by stamping a **unique `processAffinity`** per view in the platform
override. Before this change, all same-origin views — ten 20k-row streaming
blotters included — shared **one renderer process and one main thread**.
Measured result with ~11 blotters on one machine:

| | Before (shared renderer) | After (isolated) |
|---|---|---|
| Blotter renderer processes | **1** × 4,705 MB | **~11** × ~200 MB |
| Blotter renderer CPU | 6.2% total = **one core saturated**, all views queued on it | 0.5–0.7% **each**, main threads ~90% idle |
| Total OpenFin memory | 5,566 MB | **3,120 MB (−2.4 GB)** |
| Interaction | fleet-wide sluggish typing/clicking/scrolling | crisp |

Total memory went **down**, not up: one giant V8 heap under constant
allocation pressure from ten grids fragments and defers GC; ten small
heaps each collect cheaply and stay compact.

## The diagnostic signature (worth remembering)

The fleet was sluggish while Task Manager showed only **~32% total CPU** —
which repeatedly (mis)read as "the machine has headroom, so the app is
slow". The tell: **sluggish UI at low aggregate CPU means individual
threads are saturated while the rest of the chip idles.** On a 16-thread
machine, one fully pegged core reads as just **6.25%** aggregate. The
Processes view made it unambiguous: one OpenFin process at 4.7 GB / 6.2%
CPU (= exactly one core), while ten blotters were open and no other
process was doing meaningful work. Ten grids' decode, React, AG Grid
apply, and paint were all queuing on a single main thread.

Per-process Task Manager (or `chrome://inspect` → per-target Performance
trace) localizes this in seconds; aggregate CPU graphs never will.

## Root cause

Two stacked causes:

1. **Chromium groups same-origin content into a shared renderer process.**
   Every platform view here is served from one origin (one Vite app), so
   by default OpenFin packs all of them into one renderer. OpenFin's
   `processAffinity` view option makes the grouping explicit: views with
   the **same affinity string share one renderer process**.
2. **The star-demo seed made it worse** by explicitly pinning
   `"processAffinity": "star-demo"` on its views — and every duplicated
   page/tab carried that pin along, guaranteeing the single-process fleet
   no matter how many blotters the user opened.

A third, compounding factor: **Windows 11 EcoQoS** stamped the one
overloaded renderer "Efficiency mode" — scheduling it on efficiency cores
at reduced priority — throttling the very process doing all the work.

## The fix

### 1. Unique affinity per view, stamped centrally

[`viewProcessIsolation.ts`](../../packages/openfin/openfin-platform/src/viewProcessIsolation.ts):

```ts
export function ensureViewProcessIsolation(opts) {
  opts.processAffinity = opts.name
    ? `view-iso-${opts.name}`      // stable: restored views return to their process
    : generateAffinityKey();       // "view-iso-<uuid>" for nameless creations
  return opts;
}

export function isolateLayoutViews(layout) { /* recursive walk, see below */ }
```

Design decisions:

- **The view `name` is the affinity key** when present. Names are stable
  across snapshot save/restore, so a restored view returns to *its own*
  process instead of minting an unbounded set of affinity strings.
- **Caller-supplied affinities are REPLACED**, not respected — a shared
  inbound affinity (the seed's legacy `"star-demo"`, re-imported through
  every page duplication) is precisely the bug this exists to fix.
- A static `defaultViewOptions.processAffinity` in the manifest **cannot**
  express this: one static string = one shared group = the exact bug.
  Uniqueness requires code at creation time.

### 2. Wired into the platform override — both creation paths

[`workspacePersistence.ts`](../../packages/openfin/openfin-platform/src/workspacePersistence.ts)
(`MarketsUIWorkspaceProvider`, the `overrideCallback` every consumer of
`initWorkspace()` already uses):

```ts
async createView(payload, callerIdentity) {
  if (payload?.opts) ensureViewProcessIsolation(payload.opts);
  return super.createView(payload, callerIdentity);
}

async createWindow(payload, identity) {
  isolateLayoutViews(payload?.layout);
  isolateLayoutViews(payload?.windowOptions?.layout);
  return super.createWindow(payload, identity);
}
```

Why both hooks:

| Path | Covered by |
|---|---|
| Browser "+" tab, page duplication, dock component launches | `createView` |
| Workspace restore / seed import — views arrive **embedded in the window's layout tree**, not as per-view `createView` calls | `createWindow` + `isolateLayoutViews` walking the golden-layout tree and stamping every view `componentState` |

Because this lives in the shared `openfin-platform` provider, **every app
using `initWorkspace()`** (star-demo, markets-ui-react-reference, …) gets
isolation with no app-side change.

### 3. Seed hardening (defense in depth)

[`apps/demos/star-demo/public/seed.json`](../../apps/demos/star-demo/public/seed.json):
the three `"processAffinity": "star-demo"` pins became distinct
`view-iso-seed-1/2/3` values. The `createWindow` walker replaces them at
restore anyway; the seed just no longer encodes the bug if some future
path bypasses the override.

### 4. EcoQoS disabled for background renderers

[`apps/demos/star-demo/public/platform/manifest.fin.json`](../../apps/demos/star-demo/public/platform/manifest.fin.json):

```
--disable-features=UseEcoQoSForBackgroundProcess
```

Background blotters are live trading views that must keep consuming their
stream at full speed; Windows demoting them to efficiency-core scheduling
is the wrong policy for this workload. (This is per-manifest — other apps
opt in by adding the same runtime argument.)

## What is deliberately NOT isolated

**Child tool windows and popouts** (`fin.Window.create` — see
[`popoutWindow.ts`](../../packages/openfin/host-openfin/src/popoutWindow.ts))
keep OpenFin's default process grouping. The React-portal popout pattern
requires same-process DOM access (`getWebWindow()`), which default
grouping provides and an affinity would break — that file documents the
history. **Smoke test after any affinity change:** pop out the customizer
drawer; if it ever renders blank, derive the popout's affinity from its
caller instead.

## Operational notes for multi-window perf work

- **Never perf-test multi-window on the Vite dev server.** Dev mode serves
  hundreds of unminified modules per view from a single process; the first
  navigate after code changes also pays dependency re-optimization
  (observed: 61 s `createView::navigate`). Use the built app:
  `npm run build:apps`, then `preview` + `client` in the app.
- **Fully close the platform after worker code changes.** The SharedWorker
  outlives windows; new client code attached to a stale worker sends RPCs
  the old worker silently drops (e.g. `provider-running`), hanging grid
  wiring forever.
- **Watch the one remaining busy process** as blotter count grows: the
  OpenFin browser process (compositing) or the SharedWorker host (hub
  fan-out). If it approaches one full core (6.25% aggregate on 16
  threads), inspect via the manifest's `devtools_port` and escalate — the
  parked design for a saturated hub thread is an ingest worker with
  transferable hand-off, **not** per-window WebSockets (those multiply
  upstream parse per window and move it onto the contended main threads).
- **Memory per additional blotter** is now ~200 MB (own renderer). Budget
  accordingly; commit-charge pressure amplifies everything.

## Related

- [`hub-fanout-optimizations.md`](../hub-fanout-optimizations.md) — the
  SharedWorker data-plane series this change completed (same branch):
  fan-out pool removal, bucketed replay, thin deltas, grid update-rate cap.
- `docs/current-features.md` → OpenFin Utils → Workspace initialization —
  the feature-inventory bullet for this capability.
