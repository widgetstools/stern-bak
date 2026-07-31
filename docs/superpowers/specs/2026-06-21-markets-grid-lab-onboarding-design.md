# MarketsGrid Lab — Developer Onboarding Rework

**Date:** 2026-06-21
**App:** `apps/demos/markets-grid-lab`
**Status:** Approved design, ready for implementation planning

## Goal

Make the MarketsGrid Feature Lab **self-explanatory for developers integrating
the grid**. Today the lab demonstrates 17 features but doesn't *teach* them:
help is hidden in collapsible sheets, there's no landing/onboarding, and the
experience assumes you already know what to click. This rework adds guidance,
structure, and per-feature explanation so an integrating developer can arrive
cold and understand what MarketsGrid does and how to configure each capability.

**Primary lens:** MarketsGrid is **config-driven** — features are configured
through the grid's own UI (settings sheet, toolbars, modules) and persisted as
**profiles**, not wired up with hand-written React. All teaching content frames
features this way: *configure-via-UI, persist-as-profile*, with the minimal host
mount being the only code a developer writes.

## Audience

Developers who will embed MarketsGrid. They want: what each feature does, when to
use it, the config that produces it, the relevant props/options, and a guided way
to try the interaction live.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Primary goal | Onboarding & guidance |
| Audience | Developers integrating the grid (config-driven framing) |
| Per-feature content | Config (copyable) + What/Why + Try-this steps + Props/API |
| Entry experience | New `Home` landing tab with a feature map |
| Navigation | Grouped left sidebar by category (replaces horizontal tab strip) |
| Scope | Shared feature-page framework applied to **all** tabs (cohesive) |
| Page layout | **A — bottom Inspector drawer**: grid full-width, guidance in a dockable tabbed drawer beneath it; Demo Console keeps its right rail |

## Non-Goals (YAGNI)

- **No new grid features.** Row-grouping / pivot / master-detail demos are *not*
  added in this pass — this is an onboarding rework of existing capabilities only.
- No server/data backend changes; the SharedWorker mock stream stays as-is.
- No mobile-responsive redesign (desktop layout assumption preserved).
- No first-visit spotlight/tour overlay — the Home page + Inspector replace the
  need for one.
- No rewrite of per-tab grid wiring — we wrap existing tabs, not rebuild them.

## Architecture

### 1. Information architecture & navigation

Replace the horizontal scrolling tab strip (`LabTabsNav`) with a **grouped left
sidebar** (`LabSidebarNav`): collapsible groups, active-item highlight, selection
persisted to `localStorage`. The header keeps the title + theme toggle and gains a
**filter/jump box** that fuzzy-filters sidebar items. The right-hand **Demo
Console** (`LabScenarioRail`) is unchanged and stays collapsible.

**Sidebar groups:**

- **Getting Started** — `Home` *(new)*, `Overview`
- **Formatting & Display** — Formatting, Cell Renderers, Conditional Styling, Formatter Toolbar, Visual Excel
- **Columns & Layout** — Column Groups, Calculated Columns
- **Filtering & Live Data** — Quick Filters, Live Updates, Alerts
- **Editing** — Editing, Smart Edit, Bulk Update, Plus/Minus, Shortcuts
- **Profiles & Persistence** — Profiles

### 2. Feature-page shell (Layout A)

Every feature tab renders through **one shared shell** (an evolution of the
existing `LabFeatureTab`) with three zones:

1. **Page header** — feature title, category badge, one-line summary.
2. **Live grid** — full-width, the star; existing per-tab columns/profiles/mounting unchanged.
3. **Inspector drawer** — dockable, collapsible panel beneath the grid with four tabs:
   - **What & Why** — 2–4 sentences inline (sourced from existing `help/*.md`):
     what it does, when to use it, gotchas. Optional "Full docs" expand renders the
     rest of the markdown.
   - **Try this** — numbered interactive steps for the live grid
     (e.g. "1. Click a cell → 2. Press `+` → 3. watch it nudge"). Where a feature is
     reached via the settings sheet or a toolbar, steps say so explicitly.
   - **Config** — the config that produces what's on screen, copy-to-clipboard;
     framed as *"this is what the settings UI persists."*
   - **Props / API** — compact table of the relevant `MarketsGrid` props / module
     options for this feature (name · type · default · note).

The drawer persists its open/closed state and last-used tab to `localStorage`.

### 3. Per-feature content model

Each feature is described by one declarative **metadata object**, extending
`labFeatureConfigs.ts`, so the shell stays presentation-only and content is data:

```ts
interface FeatureGuide {
  id: string;                 // matches tab/grid id
  category: GroupId;          // sidebar grouping
  summary: string;            // one-liner for header + Home card
  whatWhy: string;            // markdown — sourced from existing help/*.md
  trySteps: { text: string; hint?: string }[];
  config: {                   // the "Config" tab (one or more blocks)
    label: string;            // e.g. "Conditional styling rules"
    lang: 'json' | 'tsx';
    code: string;             // serialized from the real seed driving the tab
  }[];
  props: { name: string; type: string; default?: string; note: string }[];
  docsHref?: string;          // optional deep link
}
```

**Config blocks are generated from the existing seed objects** that already drive
each tab (`seeds/conditionalStyling.ts`, `seeds/alerts.ts`,
`seeds/calculatedColumns.ts`, profile catalogs, etc.). A small serializer turns
the real seed → display JSON, so the shown config is guaranteed to match what's
running and there is no second copy to maintain. Props tables are authored once
per feature (~5–8 rows) from the MarketsGrid prop surface.

### 4. Home landing page

A new scrollable `Home` view, set as the default landing:

1. **Hero** — "MarketsGrid: a config-driven enterprise data grid" + one-paragraph what-it-is.
2. **Mount in 30 seconds** — the minimal
   `<MarketsGrid gridId rowData columnDefs storage />` snippet (copyable), with a
   note that everything else is configured through the grid's own UI and saved as a
   profile.
3. **The mental model** — four labeled cards: **Profiles** (saved config
   snapshots), **Modules** (feature units), **Settings sheet** (where you
   configure), **Toolbars** (filters / formatting / editing). Each links to the tab
   that demonstrates it.
4. **Feature map** — cards grouped by the six categories, one per feature, each
   showing its `summary` and an "Open demo →" link.
5. **Recommended path** — short ordered list: Overview → Formatting → Conditional
   Styling → Editing → Profiles.

## Reconciliation with existing code

| Existing | Change |
|---|---|
| `LabFeatureTab.tsx` | Evolves into the shared shell (header + grid slot + Inspector drawer) |
| `labFeatureConfigs.ts` | Gains the `FeatureGuide` fields per tab |
| `help/*.md` | Feeds **What & Why** (and optional full-docs expand); not discarded |
| `LabScenarioRail` / Demo Console | Untouched |
| `LabTabsNav.tsx` | Replaced by `LabSidebarNav` |
| `App.tsx` | New layout: sidebar + main (shell) + console rail; `Home` default tab |
| Per-tab grid wiring | Unchanged — wrapped, not rewritten |

## Testing

- **Unit:** seed→JSON serializer; `FeatureGuide` registry completeness check
  (every tab has `summary`, `whatWhy`, ≥1 `trySteps`, ≥1 `config` block, `props`).
- **Playwright smoke:** Home renders; sidebar groups expand/collapse; a feature
  page mounts its grid; the Inspector drawer toggles and switches tabs.
- **Docs:** update `docs/current-features.md` per the post-implementation checklist.

## Success criteria

A developer opening the lab cold can, without prior knowledge: understand what
MarketsGrid is from `Home`, navigate to any feature by category, read what it does
and why, follow steps to see it work live, and copy the config that produces it —
all framed around the config-driven / profile model.
