# Alerts — expression + delta triggers, multi-channel notifications

## Run the demo

From the repo root:

```bash
npm run dev:markets-grid-lab
```

Open **http://localhost:5300/**, click the **Alerts** tab, and wait a few
seconds. The toolbar **bell** count should climb and toasts appear when
rules like **Mid moves > 0.5%** or **Bid > $110** fire on mock ticks.

### Profile selector (feature-by-feature)

On first load the tab installs **9 demo profiles** into the toolbar
**profile / layout selector** (plus **Default** with no rules). Switch
profiles to isolate one behaviour at a time:

| Profile | Focus |
| --- | --- |
| **00 · Full demo** | All triggers + channels (start here) |
| **01 · Data-change** | Expression rules on bid + daily P&L |
| **02 · Relative-change** | Mid % move threshold |
| **03 · Row add/remove** | Row-change triggers (needs add/remove feed) |
| **04 · Toast only** | Bottom-right toasts, badge channel off |
| **05 · Badge only** | Bell + history, no toasts |
| **06 · Rate limit** | Hot rules + **1** notification/sec cap |
| **07 · Debounce** | 8s debounce on bid rule |
| **08 · Paused** | Rules loaded; switch evaluation to **Realtime** |

**Import** a profile from disk: profile menu → Import → pick a file under
[`public/lab-profiles/alerts/`](../../public/lab-profiles/alerts/) (e.g.
`alert-04-toast-channel.json`).

**Reset** installed profiles (`gridId` `lab-alerts-v2`):

```js
localStorage.removeItem('markets-grid-bundle:lab-alerts-v2');
localStorage.removeItem('lab-demo-profiles-v2:lab-alerts-v2');
```

Then reload the Alerts tab.

Use **Tools** (settings gear) → module picker → **Alerts** to tune rules,
debounce, rate limit, and channels. Each rule editor matches **Style Rules**:
**RESET** / **SAVE** on the title row, and the **Expression** trigger uses the
same Monaco expression editor (`[columnId]` syntax, column completions).

The bell popover shows history; **Mark read** clears the badge without wiping entries.

> Dev must use `STARUI_DEV_SOURCE=1` (the lab `dev` script sets this) so
> Vite resolves `@wellsfargo-starui/grid` from `packages/react-grid` source, not a
> stale tarball.

---

This tab seeds **7 alert rules** under `Tools → Alerts` covering all three
trigger families. Five fire against the mock stream; two (row-add / row-remove)
stay disabled by default because the mock provider only updates existing
rows — flip them on if you wire the grid to a real add/remove feed.

## Watch the toolbar bell

Look in the top-right of the toolbar: the bell icon shows an unread count.
Click it to see the rolling history of fired notifications. "Mark read"
clears the badge without losing the entries; "Clear" wipes history.

Toast popovers appear in the bottom-right when the toast channel is on.

## Seeded rules

| # | Rule | Trigger | Severity | Channels |
| --- | --- | --- | --- | --- |
| 1 | **Bid > $110** | `dataChange`: `[bidPrice] > 110` on `bidPrice` | warning | toast, badge, openfin |
| 2 | **Daily P&L < −$25k** | `dataChange`: `[dailyPnL] < -25000` on `dailyPnL` | critical | toast, badge, openfin |
| 3 | **YTW > 9%** *(disabled)* | `dataChange`: `[yieldToWorst] > 9` | info | badge |
| 4 | **Mid moves > 0.5%** | `relativeChange`: PERCENT, threshold 0.5%, either direction | info | toast, badge |
| 5 | **Any change on bid** *(disabled)* | `relativeChange`: ANY_CHANGE on `bidPrice` | info | badge |
| 6 | **New position appears** *(disabled)* | `rowChange`: ROW_ADDED | success | toast, badge, openfin |
| 7 | **Position removed** *(disabled)* | `rowChange`: ROW_REMOVED | warning | toast, badge, openfin |

## Trigger families

**`dataChange`** — boolean expression evaluated on every cell change. Supports
the same syntax as conditional-styling: `[columnId]` reads sibling cells,
`value` (alias `x`) is the changed cell. Optionally restricted to a single
source column via the `column` field — without it, the rule fires whenever
ANY cell change satisfies the predicate.

**`relativeChange`** — numeric delta between this tick and the previous tick
on a specific column. Modes: `PERCENT_CHANGE` (threshold in %),
`ABSOLUTE_CHANGE` (threshold in raw units), `ANY_CHANGE` (no threshold).
Direction filter: `up`, `down`, or `both`. The first observation per
(row, column) is silent — there's no baseline to compare against.

**`rowChange`** — fires when AG-Grid's `modelUpdated`/`rowDataUpdated` diff
shows a row ID appearing or disappearing.

## Module-level settings (top of the Alerts panel)

| Setting | What it does |
| --- | --- |
| **Enable alerts** | Master kill-switch — toggling off short-circuits dispatch but keeps rules + history intact |
| **Evaluation mode** | `Realtime` evaluates every change immediately; `Throttled` coalesces per frame; `Paused` halts new evaluations while preserving history |
| **Default debounce** | Min ms between two firings of the same rule for the same row when the rule itself doesn't set `debounceMs` |
| **Max notifications / sec** | Global token bucket — drops over-budget hits silently rather than flooding the toast layer |
| **Show toasts / badge / OpenFin** | Per-channel kill-switches. A rule's `channels` array intersects with these |
| **Keep last N notifications** | History cap (oldest pruned first) |

## OpenFin integration

When the page detects `window.fin` at mount time, `useAlertsOpenFinBridge`
**dynamic-imports** `@openfin/workspace/notifications` and dispatches each
alert through the OpenFin Notification Centre — title, body, severity
category, and a `customData` payload (rule id, row id, column, severity).

In a plain browser the bridge no-ops silently; the OpenFin toggle in the
settings band is greyed out with a "host not detected" hint.

## How to test the surface live

1. Wait a few seconds — `Mid moves > 0.5%` should fire first; you'll see
   toasts plus the bell count climb.
2. Open the bell popover and click **Mark read** — count clears, entries
   stay.
3. Open `Tools → Alerts` and toggle **Evaluation mode** to `Paused`. New
   ticks stop landing in history; flip back to `Realtime` to resume.
4. Set **Max notifications / sec** to `1` and watch the badge count slow
   even though ticks keep arriving — dropped hits are silent.
5. Toggle **Show toasts** off but keep **Show badge count** on — count
   still climbs without the bottom-right popups.
6. Open any rule and switch its **Severity** to `critical` — the next
   toast will use the destructive variant.

## What's NOT in the demo (P1 follow-ups)

- Aggregation / observable / validation trigger families
- Dashboard cell-highlight + auto-jump on fire
- Public `alert:fired` event for external listeners
- Auto-flashing the offending cell via `api.flashCells({...})`
