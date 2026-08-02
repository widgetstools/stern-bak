# MarketsGrid Lab — Developer Onboarding Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/demos/markets-grid-lab` into a self-explanatory, developer-onboarding showcase: a grouped sidebar, a Home landing page, and a shared feature-page shell with a bottom Inspector drawer (What/Why · Try-this · Config · Props) on every feature tab.

**Architecture:** A new `guides/` data layer describes each feature declaratively (`FeatureGuide`). The existing `LabFeatureTab` evolves into a shell that renders the live grid plus an `InspectorDrawer` driven by the matching guide; config blocks are *derived* from the same `LabFeatureConfig` object that drives the grid (so shown config always matches reality). A grouped `LabSidebarNav` replaces the horizontal `LabTabsNav`, and a new `HomeTab` becomes the default landing with a feature map. `App.tsx` re-lays-out to sidebar + main + existing Demo Console rail.

**Tech Stack:** React 19, Vite 7, TypeScript 5.9, `@wellsfargo-starui/ui` (shadcn primitives), `@wellsfargo-starui/grid` (`MarketsGrid`), Tailwind 3.4, Vitest 4, Playwright 1.59.

## Global Constraints

- **Preserve `data-testid="lab-tab-<id>"` on every nav item.** The existing e2e suite (`e2e/v2-*.spec.ts`, `e2e/helpers/labEditing.ts:65`) navigates tabs by clicking these testids. Items must be clickable and switch the active tab. Do **not** change any existing tab `id` (`overview`, `formatting`, `visual-excel`, `renderers`, `toolbar`, `groups`, `calc`, `conditional`, `filters`, `live`, `alerts`, `editing`, `bulk-update`, `plus-minus`, `shortcuts`, `profiles`).
- **Keep the Radix `Tabs`/`TabsContent` value mechanism** in `App.tsx` so lazy tab content and existing specs keep working; the sidebar drives it via `onValueChange`.
- **Design-system tokens only.** New chrome uses `--ds-*` CSS variables (e.g. `var(--ds-surface-primary)`, `var(--ds-text-secondary)`, `var(--ds-border-primary)`). No hardcoded hex in new components. Must render under both `[data-theme="dark"]` and `[data-theme="light"]`.
- **shadcn primitives only** (from `@wellsfargo-starui/ui`) — no native `<input>`/`<select>`/`<textarea>`. Icons from `lucide-react`.
- **Lab runs on port 5300** (`playwright.config.ts`). Lab unit tests run from repo root with `npx vitest run <path>` (jsdom from the app's Vite config).
- **File/symbol naming:** camelCase/PascalCase only in this React app (no kebab). Component files `PascalCase.tsx`, hooks `useX.ts`, plain modules `camelCase.ts`, types in `types.ts`.
- **Complexity ceilings:** 800 LOC/file, 80 LOC/function.
- **Config-driven framing:** all guidance copy frames features as *configure-via-the-grid's-UI, persist-as-a-profile*, not hand-written React.

All work happens on branch `feat/markets-grid-lab-onboarding` (already created).

---

## File Structure

```
apps/demos/markets-grid-lab/src/
  guides/
    types.ts              # FeatureGuide + sub-types (Task 1)
    serializeConfig.ts    # safe JSON stringify for config display (Task 1)
    serializeConfig.test.ts
    categories.ts         # LAB_CATEGORIES + tab→category model (Task 1)
    featureGuides.ts      # the 16 guide entries + BASE_PROPS (Task 2)
    featureGuides.test.ts # registry completeness (Task 2)
    buildConfigBlocks.ts  # derive Config blocks from a LabFeatureConfig (Task 3)
    buildConfigBlocks.test.ts
  components/
    InspectorDrawer.tsx   # bottom dockable What/Why·Try·Config·Props (Task 4)
    LabSidebarNav.tsx     # grouped, collapsible sidebar + filter (Task 6)
  tabs/
    LabFeatureTab.tsx     # EVOLVE into shell (grid + InspectorDrawer) (Task 5)
    HomeTab.tsx           # NEW landing page (Task 7)
  App.tsx                 # re-layout: sidebar + main + rail; Home default (Task 8)
e2e/
  lab-onboarding.spec.ts  # smoke spec (Task 9)
docs/current-features.md  # update (Task 9)
```

`components/LabTabsNav.tsx` is deleted in Task 8 (replaced by `LabSidebarNav`).

---

### Task 1: Guides scaffolding — types, serializer, categories

**Files:**
- Create: `apps/demos/markets-grid-lab/src/guides/types.ts`
- Create: `apps/demos/markets-grid-lab/src/guides/serializeConfig.ts`
- Create: `apps/demos/markets-grid-lab/src/guides/serializeConfig.test.ts`
- Create: `apps/demos/markets-grid-lab/src/guides/categories.ts`

**Interfaces:**
- Produces: `FeatureGuide`, `FeatureGuideTryStep`, `FeatureGuidePropRow`, `FeatureGuideConfigBlock`, `LabCategoryId` (types.ts); `serializeConfig(value: unknown): string` (serializeConfig.ts); `LabCategory`, `LAB_CATEGORIES: LabCategory[]` (categories.ts).

- [ ] **Step 1: Write the failing test for `serializeConfig`**

Create `apps/demos/markets-grid-lab/src/guides/serializeConfig.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { serializeConfig } from './serializeConfig';

describe('serializeConfig', () => {
  it('pretty-prints plain objects with 2-space indent', () => {
    expect(serializeConfig({ a: 1, b: 'x' })).toBe('{\n  "a": 1,\n  "b": "x"\n}');
  });

  it('replaces functions with a stable [Function] marker', () => {
    const out = serializeConfig({ valueFormatter: () => 'x', field: 'mid' });
    expect(out).toContain('"valueFormatter": "[Function]"');
    expect(out).toContain('"field": "mid"');
  });

  it('drops undefined and renders nested arrays', () => {
    expect(serializeConfig({ cols: ['a', 'b'], skip: undefined })).toBe(
      '{\n  "cols": [\n    "a",\n    "b"\n  ]\n}',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/demos/markets-grid-lab/src/guides/serializeConfig.test.ts`
Expected: FAIL — cannot find module `./serializeConfig`.

- [ ] **Step 3: Implement `serializeConfig`**

Create `apps/demos/markets-grid-lab/src/guides/serializeConfig.ts`:

```ts
/**
 * JSON-stringify a value for read-only display in the Inspector "Config" tab.
 * Functions (e.g. ag-grid valueFormatter/valueGetter on ColDefs) are not
 * serializable, so they render as a stable `[Function]` marker instead of
 * being dropped — the developer still sees that the column carries one.
 */
export function serializeConfig(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val) => (typeof val === 'function' ? '[Function]' : val),
    2,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/demos/markets-grid-lab/src/guides/serializeConfig.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the guide types**

Create `apps/demos/markets-grid-lab/src/guides/types.ts`:

```ts
/** Sidebar category a feature belongs to. */
export type LabCategoryId =
  | 'getting-started'
  | 'formatting-display'
  | 'columns-layout'
  | 'filtering-data'
  | 'editing'
  | 'profiles';

/** One numbered step in the Inspector "Try this" tab. */
export interface FeatureGuideTryStep {
  text: string;
  /** Optional secondary hint shown muted under the step. */
  hint?: string;
}

/** One row in the Inspector "Props / API" table. */
export interface FeatureGuidePropRow {
  name: string;
  type: string;
  default?: string;
  note: string;
}

/** A hand-authored extra config block (module config the derived blocks miss). */
export interface FeatureGuideConfigBlock {
  label: string;
  lang: 'json' | 'tsx';
  code: string;
}

/**
 * Declarative description of one feature tab, rendered by the Inspector drawer.
 * Config blocks are mostly DERIVED from the tab's LabFeatureConfig at render
 * time (see buildConfigBlocks); `extraConfig` is for module config that the
 * derivation can't see (e.g. conditional-styling rule arrays).
 */
export interface FeatureGuide {
  /** Matches the tab/`LabFeatureConfig.tabId`. */
  id: string;
  category: LabCategoryId;
  /** One-liner for the page header and Home feature-map card. */
  summary: string;
  /** Markdown — "what it does, when to use it, gotchas". */
  whatWhy: string;
  trySteps: FeatureGuideTryStep[];
  /** Feature-specific props (BASE_PROPS are prepended by the shell). */
  props: FeatureGuidePropRow[];
  /** Optional hand-authored config blocks appended after derived ones. */
  extraConfig?: FeatureGuideConfigBlock[];
  docsHref?: string;
}
```

- [ ] **Step 6: Create the category model**

Create `apps/demos/markets-grid-lab/src/guides/categories.ts`:

```ts
import type { LabCategoryId } from './types';

export interface LabCategory {
  id: LabCategoryId;
  label: string;
  /** Tab ids in display order. `home` is the synthetic landing tab. */
  tabIds: string[];
}

/**
 * Sidebar grouping. Order here is the order shown in the nav. Every id except
 * `home` must correspond to an existing tab in App.tsx; `home` is new.
 */
export const LAB_CATEGORIES: LabCategory[] = [
  { id: 'getting-started', label: 'Getting Started', tabIds: ['home', 'overview'] },
  {
    id: 'formatting-display',
    label: 'Formatting & Display',
    tabIds: ['formatting', 'renderers', 'conditional', 'toolbar', 'visual-excel'],
  },
  { id: 'columns-layout', label: 'Columns & Layout', tabIds: ['groups', 'calc'] },
  { id: 'filtering-data', label: 'Filtering & Live Data', tabIds: ['filters', 'live', 'alerts'] },
  { id: 'editing', label: 'Editing', tabIds: ['editing', 'bulk-update', 'plus-minus', 'shortcuts'] },
  { id: 'profiles', label: 'Profiles & Persistence', tabIds: ['profiles'] },
];
```

- [ ] **Step 7: Typecheck the new modules**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/demos/markets-grid-lab/src/guides/types.ts \
        apps/demos/markets-grid-lab/src/guides/serializeConfig.ts \
        apps/demos/markets-grid-lab/src/guides/serializeConfig.test.ts \
        apps/demos/markets-grid-lab/src/guides/categories.ts
git commit -m "feat(markets-grid-lab): guide types, config serializer, category model

```

---

### Task 2: Feature-guide registry + shared base props

**Files:**
- Create: `apps/demos/markets-grid-lab/src/guides/featureGuides.ts`
- Create: `apps/demos/markets-grid-lab/src/guides/featureGuides.test.ts`

**Interfaces:**
- Consumes: `FeatureGuide`, `FeatureGuidePropRow` (Task 1 types); `LAB_CATEGORIES` (Task 1).
- Produces: `BASE_PROPS: FeatureGuidePropRow[]`; `FEATURE_GUIDES: Record<string, FeatureGuide>`; `getFeatureGuide(id: string): FeatureGuide | undefined`.

- [ ] **Step 1: Write the failing registry-completeness test**

Create `apps/demos/markets-grid-lab/src/guides/featureGuides.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FEATURE_GUIDES, BASE_PROPS, getFeatureGuide } from './featureGuides';
import { LAB_CATEGORIES } from './categories';

// Every real tab id that App.tsx renders, excluding the synthetic `home`.
const TAB_IDS = [
  'overview', 'formatting', 'visual-excel', 'renderers', 'toolbar',
  'groups', 'calc', 'conditional', 'filters', 'live', 'alerts',
  'editing', 'bulk-update', 'plus-minus', 'shortcuts', 'profiles',
];

describe('FEATURE_GUIDES registry', () => {
  it('has a guide for every tab id', () => {
    for (const id of TAB_IDS) {
      expect(getFeatureGuide(id), `missing guide: ${id}`).toBeDefined();
    }
  });

  it('every guide has non-empty summary, whatWhy, and >=1 try step', () => {
    for (const id of TAB_IDS) {
      const g = getFeatureGuide(id)!;
      expect(g.summary.length, `${id}.summary`).toBeGreaterThan(0);
      expect(g.whatWhy.length, `${id}.whatWhy`).toBeGreaterThan(0);
      expect(g.trySteps.length, `${id}.trySteps`).toBeGreaterThan(0);
    }
  });

  it('every guide category exists in LAB_CATEGORIES', () => {
    const known = new Set(LAB_CATEGORIES.map((c) => c.id));
    for (const id of TAB_IDS) {
      expect(known.has(getFeatureGuide(id)!.category), `${id}.category`).toBe(true);
    }
  });

  it('every guide id matches its registry key', () => {
    for (const [key, g] of Object.entries(FEATURE_GUIDES)) {
      expect(g.id).toBe(key);
    }
  });

  it('BASE_PROPS covers the universal mount props', () => {
    const names = BASE_PROPS.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(['gridId', 'rowData', 'columnDefs', 'rowIdField', 'storage']),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/demos/markets-grid-lab/src/guides/featureGuides.test.ts`
Expected: FAIL — cannot find module `./featureGuides`.

- [ ] **Step 3: Implement the registry**

Create `apps/demos/markets-grid-lab/src/guides/featureGuides.ts`. Copy verbatim:

```ts
import type { FeatureGuide, FeatureGuidePropRow } from './types';

/** Mount props shared by every MarketsGrid in the lab — prepended to each guide's props. */
export const BASE_PROPS: FeatureGuidePropRow[] = [
  { name: 'gridId', type: 'string', note: 'Stable id; scopes the stored profile/config in localStorage.' },
  { name: 'rowData', type: 'TData[]', note: 'Row objects. The mock stream pushes delta updates here.' },
  { name: 'columnDefs', type: 'ColDef[]', note: 'ag-grid column definitions.' },
  { name: 'rowIdField', type: "string | string[]", default: "'id'", note: 'Primary key used for delta updates.' },
  { name: 'storage', type: 'StorageAdapterFactory', note: 'Where profiles persist — localStorage in the lab.' },
  { name: 'onReady', type: '(handle: MarketsGridHandle) => void', note: 'Fires when grid + module platform are ready.' },
];

const showProfileSelector: FeatureGuidePropRow = {
  name: 'showProfileSelector', type: 'boolean', default: 'true', note: 'Profile picker in the toolbar (save/clone/export).',
};
const showSaveButton: FeatureGuidePropRow = {
  name: 'showSaveButton', type: 'boolean', default: 'true', note: 'Explicit Save of the current config to the active profile.',
};
const showSettingsButton: FeatureGuidePropRow = {
  name: 'showSettingsButton', type: 'boolean', default: 'true', note: 'Opens the Settings sheet — the main place you configure modules.',
};

export const FEATURE_GUIDES: Record<string, FeatureGuide> = {
  overview: {
    id: 'overview',
    category: 'getting-started',
    summary: 'The kitchen-sink grid: filters, formatting, editing, and a profile per "lens".',
    whatWhy:
      'The Overview tab mounts MarketsGrid with most toolbars on and ships several **profiles** — each a saved snapshot of columns, styles, filters and grouping. Switch lenses from the profile selector to see how one grid serves many views. Start here to get the lay of the land, then drill into a focused tab.',
    trySteps: [
      { text: 'Open the profile selector in the toolbar and switch between the shipped lenses.' },
      { text: 'Click the Settings (gear) button to see the module list that backs the current profile.' },
      { text: 'Use the Demo Console on the right to fire a scenario and watch cells react.' },
    ],
    props: [
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Saved-filter pill carousel.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'Cell/header style + number-format toolbar.' },
      { name: 'showEditingToolbar', type: 'boolean', default: 'false', note: 'Smart-edit / bulk-update / history controls.' },
      { name: 'sideBar', type: "{ toolPanels: string[] }", note: "ag-grid side panels, e.g. ['columns','filters']." },
      { name: 'statusBar', type: '{ statusPanels: [] }', note: 'Row counts + aggregation footer.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  formatting: {
    id: 'formatting',
    category: 'formatting-display',
    summary: 'Number, date, percent and currency formatters with themed overrides.',
    whatWhy:
      'Display formatting is configured per column through the **Formatting toolbar** and persisted in the profile — no `valueFormatter` code required. Decimals, thousands separators, percent/bp scaling, and date/time patterns are all UI-driven, with separate light/dark overrides where needed. Use it whenever raw values need human-readable presentation.',
    trySteps: [
      { text: 'Select a numeric column header, then pick a format preset from the Formatting toolbar.' },
      { text: 'Export to Visual Excel — formatters are baked into the .xlsx.', hint: 'Use the export button in the toolbar.' },
    ],
    props: [
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'The format/style editor surface.' },
      { name: 'showVisualExcelExport', type: 'boolean', default: 'false', note: 'WYSIWYG styled .xlsx export button.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  renderers: {
    id: 'renderers',
    category: 'formatting-display',
    summary: 'Visual cell renderers: pills, heatmaps, sparklines, percent bars, flags.',
    whatWhy:
      'Renderers turn a cell value into a visual: a rating pill, a heatmap fill, an inline KRD sparkline, a percent bar, a country flag. They are assigned per column in the column settings and travel with the profile. Reach for them when a glance should convey magnitude or category faster than digits.',
    trySteps: [
      { text: 'Open Settings → column customization and inspect which renderer each visual column uses.' },
      { text: 'Switch profiles to compare a renderer-heavy lens against a plain one.' },
    ],
    props: [
      { name: 'defaultColDef', type: 'ColDef', note: 'Renderers tab sets autoHeight:false so bars/sparklines size cleanly.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  conditional: {
    id: 'conditional',
    category: 'formatting-display',
    summary: 'Expression-driven cell/row styling, flashes, indicators and diff rules.',
    whatWhy:
      'Conditional styling paints cells or rows from boolean **expressions** (`value < 0`, `[ask] - [bid] > 0.1`, `[mid.new] > [mid.old]`). Each rule can add colour, a one-shot or pulsing flash, and an indicator badge. Rules are authored in the Settings sheet and persisted per profile. Use them to make risk, P&L direction and ticks pop without touching grid code.',
    trySteps: [
      { text: 'Open Settings → Conditional styling and toggle a rule on/off; watch the grid update live.' },
      { text: 'Fire a price-tick scenario from the Demo Console to see diff rules (`mid.new` vs `mid.old`) flash.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  toolbar: {
    id: 'toolbar',
    category: 'formatting-display',
    summary: 'The floating Formatting toolbar — paint cells and headers live.',
    whatWhy:
      'The Formatting toolbar is a floating palette for ad-hoc cell/header styling: font weight, colour, fills, borders and alignment applied to the current selection. Changes are captured into the profile so they survive reloads. It is the fastest way to demonstrate the config-driven styling pipeline interactively.',
    trySteps: [
      { text: 'Select a range of cells, then apply a fill and bold weight from the floating toolbar.' },
      { text: 'Select a column header and paint it; note cell vs header targeting.' },
      { text: 'Save the profile, reload, and confirm the styling persisted.' },
    ],
    props: [
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'Enables the floating palette.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'visual-excel': {
    id: 'visual-excel',
    category: 'formatting-display',
    summary: 'WYSIWYG .xlsx export — formatters and style rules baked into the sheet.',
    whatWhy:
      'Visual Excel export writes an .xlsx that mirrors what is on screen: number formats, rule-generated colours, fonts and fills are all carried into Excel cells, not just raw values. Configure formatting/styling as usual, then export. Use it when stakeholders want the grid as a spreadsheet that still looks like the grid.',
    trySteps: [
      { text: 'Apply a couple of formatting and conditional-style rules.' },
      { text: 'Click the Visual Excel export button and open the downloaded file to compare.' },
    ],
    props: [
      { name: 'showVisualExcelExport', type: 'boolean', default: 'false', note: 'The export button.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'So you can author the styles that get exported.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  groups: {
    id: 'groups',
    category: 'columns-layout',
    summary: 'Nested column header groups with open/closed presets.',
    whatWhy:
      'Column groups nest related columns under labelled, collapsible headers (Pricing, Yields, Risk, P&L…). Groups, their labels, styling and expand/collapse state are authored in Settings and saved per profile. Use them to tame wide blotters into scannable sections.',
    trySteps: [
      { text: 'Collapse and expand a header group directly in the grid.' },
      { text: 'Switch between the open and closed group presets via the profile selector.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  calc: {
    id: 'calc',
    category: 'columns-layout',
    summary: 'Virtual columns computed from expressions over row fields.',
    whatWhy:
      'Calculated columns add **virtual** columns from expressions (`[ask] - [bid]`, nested `IF`, cross-field math) without changing the data source. They behave like any column — styled, grouped, aggregated, flashed. Authored in Settings → Calculated columns and saved per profile. Use them for derived analytics the feed does not provide.',
    trySteps: [
      { text: 'Open Settings → Calculated columns and read one expression.' },
      { text: 'Switch profiles to add more virtual columns; watch cell-change flash on recompute.' },
    ],
    props: [
      { name: 'defaultColDef', type: 'ColDef', note: 'This tab sets enableCellChangeFlash:true so recomputes flash.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  filters: {
    id: 'filters',
    category: 'filtering-data',
    summary: 'Saved filter pills — capture, toggle, and stack filter sets.',
    whatWhy:
      'Quick filters are named filter models pinned to the toolbar as pills (High Yield, Wide Spreads, BB-rated…). Capture the current filter state into a pill, then toggle pills to stack them with AND logic. Saved per profile. Use them to give users one-click access to the views they reach for daily.',
    trySteps: [
      { text: 'Set a column filter, then capture it as a new pill from the Filters toolbar.' },
      { text: 'Toggle two pills and confirm the row count reflects the AND of both.' },
    ],
    props: [
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'The saved-filter pill carousel.' },
      { name: 'defaultColDef', type: 'ColDef', note: 'floatingFilter:true so per-column quick filters show.' },
      { name: 'sideBar', type: "{ toolPanels: ['filters'] }", note: 'ag-grid filters panel.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  live: {
    id: 'live',
    category: 'filtering-data',
    summary: 'High-frequency streaming with tick flashes and direction styling.',
    whatWhy:
      'The Live tab drives MarketsGrid with a fast mock stream (tick interval set in the Demo Console) using ag-grid delta transactions, so only changed cells repaint. Conditional rules flash ticks and colour winners/losers. Use it to see how the grid behaves under load and how flash/diff rules read in real time.',
    trySteps: [
      { text: 'Drag the tick-interval slider in the Demo Console down to ~150ms.' },
      { text: 'Watch price cells flash and P&L cells colour by direction.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  alerts: {
    id: 'alerts',
    category: 'filtering-data',
    summary: 'Expression alerts across toast, badge and OpenFin channels.',
    whatWhy:
      'Alerts watch cell values with expressions and fire on change to one or more channels (toast, bell badge, OpenFin notification), with debounce and rate limiting. Rules are authored in Settings → Alerts and saved per profile. Use them to surface threshold breaches without users staring at the grid.',
    trySteps: [
      { text: 'Open Settings → Alerts and read a rule’s expression and channels.' },
      { text: 'Fire a matching scenario from the Demo Console and watch the toast/badge.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  editing: {
    id: 'editing',
    category: 'editing',
    summary: 'The full editing family: smart-edit, bulk-update, +/- and history.',
    whatWhy:
      'The Editing tab turns on the editing toolbar so you can apply arithmetic across a selection (smart-edit), replace a range with one value (bulk-update), and step changes with undo/redo history. Editable columns are configured per column. Use it to see the complete write path in one place.',
    trySteps: [
      { text: 'Select a numeric range and apply a smart-edit operation (e.g. ×1.1).' },
      { text: 'Undo it from the edit-history controls and confirm the values revert.' },
    ],
    props: [
      { name: 'showEditingToolbar', type: 'boolean', default: 'false', note: 'Smart-edit + bulk-update + history surface.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'On here so edits and styling demo together.' },
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Filter before bulk editing a subset.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'bulk-update': {
    id: 'bulk-update',
    category: 'editing',
    summary: 'Replace a whole selection with one value — text, number or date.',
    whatWhy:
      'Bulk update writes a single value (or formula) across a rectangular selection in one action, with a confirmation step. Column editability and data type (text/number/date) are set per column. Use it for fast corrections across many rows — re-book a desk, restamp a maturity, zero a field.',
    trySteps: [
      { text: 'Select a range in an editable column.' },
      { text: 'Enter a value in the Bulk Update toolbar and apply; confirm the dialog.' },
    ],
    props: [
      { name: 'showBulkUpdateToolbar', type: 'boolean', default: 'false', note: 'The replace-selection control.' },
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of the bulk write.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'plus-minus': {
    id: 'plus-minus',
    category: 'editing',
    summary: 'Keyboard +/- nudges with per-column steps and expression gates.',
    whatWhy:
      'Plus/Minus binds the + and - keys to nudge the focused cell by a configured step (qty ±100, mid ±0.01), optionally gated by an expression so only valid rows respond. Rules are authored in Settings and saved per profile. Use it for fast keyboard-driven adjustments on a trading blotter.',
    trySteps: [
      { text: 'Focus an editable numeric cell and press + a few times.' },
      { text: 'Press - to nudge back down; undo from the history controls.' },
    ],
    props: [
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of nudges.' },
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Scope before nudging.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  shortcuts: {
    id: 'shortcuts',
    category: 'editing',
    summary: 'Letter-key arithmetic shortcuts on the focused cell.',
    whatWhy:
      'Shortcuts map letter keys to arithmetic operations on the focused numeric cell (e.g. H = ×100, M = +1000, L = −500). Distinct from K/M/B input parsing — these are operations, not units. Authored in Settings and saved per profile. Use them for power-user keyboard workflows.',
    trySteps: [
      { text: 'Focus an editable numeric cell and press a configured letter key.' },
      { text: 'Open Settings → Shortcuts to see the full key→operation map.' },
    ],
    props: [
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of shortcut ops.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  profiles: {
    id: 'profiles',
    category: 'profiles',
    summary: 'Pre-baked configuration "lenses" you can clone, export and import.',
    whatWhy:
      'A profile is an atomic snapshot of everything you configured — columns, styles, filters, grouping, module state — saved under a `gridId`. Clone, rename, export to JSON, and import them. This tab is a gallery of ready-made lenses (Trader, Analytics, Compact, Grouped). Profiles are the unit of persistence the whole lab is built on.',
    trySteps: [
      { text: 'Pick a preset lens from the gallery and open it.' },
      { text: 'Tweak a setting, Save, reload — confirm it persisted under the profile.' },
    ],
    props: [
      showProfileSelector,
      showSaveButton,
      { name: 'appId / userId / instanceId', type: 'string', note: 'Scope keys when persisting via a ConfigService instead of localStorage.' },
    ],
  },
};

export function getFeatureGuide(id: string): FeatureGuide | undefined {
  return FEATURE_GUIDES[id];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/demos/markets-grid-lab/src/guides/featureGuides.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/demos/markets-grid-lab/src/guides/featureGuides.ts \
        apps/demos/markets-grid-lab/src/guides/featureGuides.test.ts
git commit -m "feat(markets-grid-lab): feature-guide registry + shared base props

```

---

### Task 3: Derive Config blocks from a LabFeatureConfig

**Files:**
- Create: `apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.ts`
- Create: `apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.test.ts`

**Interfaces:**
- Consumes: `LabFeatureConfig` (from `../tabs/labFeatureConfigs`), `FeatureGuide` (Task 1), `serializeConfig` (Task 1).
- Produces: `buildConfigBlocks(config: LabFeatureConfig, guide?: FeatureGuide): FeatureGuideConfigBlock[]`.

Each tab's real `LabFeatureConfig` already holds the chrome flags and column factory that drive the grid; deriving the Config display from it guarantees the shown config matches what runs. `extraConfig` from the guide is appended.

- [ ] **Step 1: Write the failing test**

Create `apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildConfigBlocks } from './buildConfigBlocks';
import type { LabFeatureConfig } from '../tabs/labFeatureConfigs';

const fakeConfig = {
  tabId: 'demo',
  providerId: 'p',
  title: 'Demo',
  subtitle: 's',
  help: '',
  gridId: 'lab-demo',
  componentName: 'Demo',
  profiles: [],
  activeProfileId: 'a',
  getColumnDefs: () => [
    { field: 'cusip', headerName: 'CUSIP', valueFormatter: () => 'x' },
    { field: 'midPrice', headerName: 'Mid' },
  ],
  grid: { showFormattingToolbar: true, showProfileSelector: true },
} as unknown as LabFeatureConfig;

describe('buildConfigBlocks', () => {
  it('emits a mount-props block from gridId + chrome', () => {
    const blocks = buildConfigBlocks(fakeConfig);
    const mount = blocks.find((b) => b.label.includes('Mount'));
    expect(mount).toBeDefined();
    expect(mount!.code).toContain('"gridId": "lab-demo"');
    expect(mount!.code).toContain('"showFormattingToolbar": true');
  });

  it('emits a columns block with field + headerName only (no functions inlined)', () => {
    const blocks = buildConfigBlocks(fakeConfig);
    const cols = blocks.find((b) => b.label.includes('Columns'));
    expect(cols).toBeDefined();
    expect(cols!.code).toContain('"field": "cusip"');
    expect(cols!.code).toContain('"headerName": "Mid"');
    expect(cols!.code).not.toContain('valueFormatter');
  });

  it('appends guide.extraConfig blocks after derived ones', () => {
    const blocks = buildConfigBlocks(fakeConfig, {
      id: 'demo', category: 'editing', summary: '', whatWhy: '', trySteps: [], props: [],
      extraConfig: [{ label: 'Rules', lang: 'json', code: '[]' }],
    });
    expect(blocks[blocks.length - 1].label).toBe('Rules');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.test.ts`
Expected: FAIL — cannot find module `./buildConfigBlocks`.

- [ ] **Step 3: Implement `buildConfigBlocks`**

Create `apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.ts`:

```ts
import type { LabFeatureConfig } from '../tabs/labFeatureConfigs';
import { serializeConfig } from './serializeConfig';
import type { FeatureGuide, FeatureGuideConfigBlock } from './types';

/**
 * Build the Inspector "Config" blocks for a tab. Derived from the SAME
 * LabFeatureConfig that mounts the grid, so the shown config can never drift
 * from what runs. `guide.extraConfig` (hand-authored module config) is appended.
 */
export function buildConfigBlocks(
  config: LabFeatureConfig,
  guide?: FeatureGuide,
): FeatureGuideConfigBlock[] {
  const mountProps = {
    gridId: config.gridId,
    componentName: config.componentName,
    rowIdField: 'id',
    ...(config.grid ?? {}),
  };

  const columns = config.getColumnDefs().map((col) => ({
    field: col.field,
    headerName: col.headerName,
  }));

  const blocks: FeatureGuideConfigBlock[] = [
    {
      label: 'Mount props (chrome)',
      lang: 'json',
      code: serializeConfig(mountProps),
    },
    {
      label: `Columns (${columns.length})`,
      lang: 'json',
      code: serializeConfig(columns),
    },
  ];

  if (guide?.extraConfig?.length) {
    blocks.push(...guide.extraConfig);
  }

  return blocks;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the conditional + live module config as `extraConfig`**

These two tabs have plain-data rule arrays worth showing verbatim. Edit `apps/demos/markets-grid-lab/src/guides/featureGuides.ts` — add an import at the top:

```ts
import { CONDITIONAL_TAB_CS_RULES, LIVE_TAB_CS_RULES } from '../seeds/conditionalStyling';
import { serializeConfig } from './serializeConfig';
```

Then add `extraConfig` to the `conditional` and `live` entries (insert the field inside each existing object):

```ts
// inside FEATURE_GUIDES.conditional, after `props: [...],`
    extraConfig: [
      {
        label: 'Conditional styling rules',
        lang: 'json',
        code: serializeConfig(CONDITIONAL_TAB_CS_RULES),
      },
    ],
```

```ts
// inside FEATURE_GUIDES.live, after `props: [...],`
    extraConfig: [
      {
        label: 'Live tick + direction rules',
        lang: 'json',
        code: serializeConfig(LIVE_TAB_CS_RULES),
      },
    ],
```

- [ ] **Step 6: Re-run the guides + config tests**

Run: `npx vitest run apps/demos/markets-grid-lab/src/guides/`
Expected: PASS (all three test files green).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.ts \
        apps/demos/markets-grid-lab/src/guides/buildConfigBlocks.test.ts \
        apps/demos/markets-grid-lab/src/guides/featureGuides.ts
git commit -m "feat(markets-grid-lab): derive Inspector config blocks from LabFeatureConfig

```

---

### Task 4: InspectorDrawer component

**Files:**
- Create: `apps/demos/markets-grid-lab/src/components/InspectorDrawer.tsx`

**Interfaces:**
- Consumes: `FeatureGuide`, `FeatureGuidePropRow`, `FeatureGuideConfigBlock` (Task 1); `BASE_PROPS` (Task 2); `Markdown` (`./Markdown`); `@wellsfargo-starui/ui` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Button`, `Badge`, `ScrollArea`, `Table*`).
- Produces: `InspectorDrawer({ guide, configBlocks, fullDocs })` where `fullDocs?: string` (markdown). Renders a collapsible bottom panel. Persists open/closed + active sub-tab to localStorage keys `lab-inspector-open`, `lab-inspector-tab`.

- [ ] **Step 1: Implement the component**

Create `apps/demos/markets-grid-lab/src/components/InspectorDrawer.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ChevronDown, Copy, Check } from 'lucide-react';
import {
  Badge,
  Button,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@wellsfargo-starui/ui';
import { Markdown } from './Markdown';
import { BASE_PROPS } from '../guides/featureGuides';
import type {
  FeatureGuide,
  FeatureGuideConfigBlock,
  FeatureGuidePropRow,
} from '../guides/types';

const OPEN_KEY = 'lab-inspector-open';
const TAB_KEY = 'lab-inspector-tab';

export interface InspectorDrawerProps {
  guide: FeatureGuide;
  configBlocks: FeatureGuideConfigBlock[];
  /** Optional full markdown docs for the "Full docs" disclosure. */
  fullDocs?: string;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  return v == null ? fallback : v === '1';
}

export function InspectorDrawer({ guide, configBlocks, fullDocs }: InspectorDrawerProps) {
  const [open, setOpen] = useState(() => readBool(OPEN_KEY, true));
  const [tab, setTab] = useState(
    () => (typeof window === 'undefined' ? 'what' : window.localStorage.getItem(TAB_KEY) ?? 'what'),
  );

  useEffect(() => {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  }, [open]);
  useEffect(() => {
    window.localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const props = [...BASE_PROPS, ...guide.props];

  return (
    <div
      className="shrink-0 border-t border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      data-testid="lab-inspector"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          Inspector
        </span>
        <Badge
          variant="outline"
          className="border-[color:var(--ds-border-primary)] text-[10px] text-[color:var(--ds-text-secondary)]"
        >
          {guide.id}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-[color:var(--ds-text-secondary)]"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse inspector' : 'Expand inspector'}
          aria-expanded={open}
          data-testid="lab-inspector-toggle"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${open ? '' : '-rotate-180'}`}
          />
        </Button>
      </div>

      {open && (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mx-3 mb-2 grid h-8 w-[min(560px,100%)] grid-cols-4 bg-[color:var(--ds-surface-secondary)] p-0.5">
            <TabsTrigger value="what" className="text-[12px]" data-testid="lab-inspector-tab-what">
              What &amp; Why
            </TabsTrigger>
            <TabsTrigger value="try" className="text-[12px]" data-testid="lab-inspector-tab-try">
              Try this
            </TabsTrigger>
            <TabsTrigger value="config" className="text-[12px]" data-testid="lab-inspector-tab-config">
              Config
            </TabsTrigger>
            <TabsTrigger value="props" className="text-[12px]" data-testid="lab-inspector-tab-props">
              Props
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[230px] px-3 pb-3">
            <TabsContent value="what" className="m-0">
              <div className="prose-sm max-w-[72ch] text-[13px] text-[color:var(--ds-text-primary)]">
                <Markdown source={guide.whatWhy} />
              </div>
              {fullDocs && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12px] text-[color:var(--ds-text-secondary)]">
                    Full docs
                  </summary>
                  <div className="mt-2 max-w-[72ch]">
                    <Markdown source={fullDocs} />
                  </div>
                </details>
              )}
            </TabsContent>

            <TabsContent value="try" className="m-0">
              <ol className="flex flex-col gap-2">
                {guide.trySteps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-[color:var(--ds-text-primary)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-surface-secondary)] text-[11px] font-semibold text-[color:var(--ds-text-secondary)]">
                      {i + 1}
                    </span>
                    <span>
                      {step.text}
                      {step.hint && (
                        <span className="mt-0.5 block text-[11px] text-[color:var(--ds-text-secondary)]">
                          {step.hint}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="config" className="m-0 flex flex-col gap-3">
              {configBlocks.map((block, i) => (
                <ConfigBlock key={i} block={block} />
              ))}
            </TabsContent>

            <TabsContent value="props" className="m-0">
              <PropsTable rows={props} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      )}
    </div>
  );
}

function ConfigBlock({ block }: { block: FeatureGuideConfigBlock }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(block.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <div className="flex items-center justify-between bg-[color:var(--ds-surface-secondary)] px-2 py-1">
        <span className="text-[11px] font-medium text-[color:var(--ds-text-secondary)]">
          {block.label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[color:var(--ds-text-secondary)]"
          onClick={copy}
          aria-label="Copy config"
          data-testid="lab-inspector-copy"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-[color:var(--ds-surface-ground)] p-2 text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">
        <code>{block.code}</code>
      </pre>
    </div>
  );
}

function PropsTable({ rows }: { rows: FeatureGuidePropRow[] }) {
  return (
    <table className="w-full border-collapse text-left text-[12px]">
      <thead>
        <tr className="border-b border-[color:var(--ds-border-primary)] text-[color:var(--ds-text-secondary)]">
          <th className="py-1 pr-3 font-medium">Prop</th>
          <th className="py-1 pr-3 font-medium">Type</th>
          <th className="py-1 pr-3 font-medium">Default</th>
          <th className="py-1 font-medium">Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-[color:var(--ds-border-primary)]/50 align-top">
            <td className="py-1 pr-3 font-mono text-[11px] text-[color:var(--ds-text-primary)]">{r.name}</td>
            <td className="py-1 pr-3 font-mono text-[11px] text-[color:var(--ds-text-secondary)]">{r.type}</td>
            <td className="py-1 pr-3 font-mono text-[11px] text-[color:var(--ds-text-secondary)]">{r.default ?? '—'}</td>
            <td className="py-1 text-[color:var(--ds-text-secondary)]">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors. (If `Badge`/`ScrollArea` are not exported, they are — verified in `@wellsfargo-starui/ui` barrel. Markdown is at `./Markdown`.)

- [ ] **Step 3: Commit**

```bash
git add apps/demos/markets-grid-lab/src/components/InspectorDrawer.tsx
git commit -m "feat(markets-grid-lab): InspectorDrawer (What/Why · Try · Config · Props)

```

---

### Task 5: Evolve LabFeatureTab into the shell

**Files:**
- Modify: `apps/demos/markets-grid-lab/src/tabs/LabFeatureTab.tsx`

**Interfaces:**
- Consumes: `getFeatureGuide` (Task 2), `buildConfigBlocks` (Task 3), `InspectorDrawer` (Task 4), existing `LabFeatureConfig`.
- Produces: unchanged export `LabFeatureTab({ config })`, now rendering grid + InspectorDrawer.

The grid keeps its `flex-1`; the drawer sits beneath it inside the same `TabContainer` children. The guide's `whatWhy` powers the drawer; the existing `config.help` markdown is passed as `fullDocs`.

- [ ] **Step 1: Replace the file body**

Replace the entire contents of `apps/demos/markets-grid-lab/src/tabs/LabFeatureTab.tsx` with:

```tsx
import { useMemo } from 'react';
import { MarketsGrid } from '@wellsfargo-starui/grid';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { defaultColDef } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { useLabRows } from '../demo/useLabRows';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import type { LabFeatureConfig } from './labFeatureConfigs';

export interface LabFeatureTabProps {
  config: LabFeatureConfig;
}

/**
 * Shared shell for feature tabs — wires the mock stream, demo profiles, and
 * MarketsGrid from a declarative config, then renders the guidance Inspector
 * drawer (What/Why · Try · Config · Props) sourced from the feature guide.
 */
export function LabFeatureTab({ config }: LabFeatureTabProps) {
  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );
  const { rowData, onReady, tickMs } = useLabRows(
    config.tabId,
    config.providerId,
    config.stream ?? { rowCount: 500, updateIntervalMs: 500 },
    onProfilesReady,
  );

  const columnDefs = useMemo(() => config.getColumnDefs(), [config]);
  const colDefBase = config.defaultColDef ?? defaultColDef;

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const subtitle = config.subtitleIncludesTickMs
    ? `${config.subtitle} · ${tickMs} ms tick · use Demo console for scenarios`
    : config.subtitle;

  const grid = config.grid ?? {};

  return (
    <TabContainer title={config.title} subtitle={subtitle} help={config.help}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <MarketsGrid
            gridId={config.gridId}
            componentName={config.componentName}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={colDefBase}
            rowIdField="id"
            storage={labStorage}
            onReady={onReady}
            showProfileSelector={grid.showProfileSelector ?? true}
            showSaveButton={grid.showSaveButton ?? true}
            showSettingsButton={grid.showSettingsButton ?? true}
            showFiltersToolbar={grid.showFiltersToolbar}
            showFormattingToolbar={grid.showFormattingToolbar}
            showEditingToolbar={grid.showEditingToolbar}
            showSmartEditToolbar={grid.showSmartEditToolbar}
            showBulkUpdateToolbar={grid.showBulkUpdateToolbar}
            showEditHistoryToolbar={grid.showEditHistoryToolbar}
            showVisualExcelExport={grid.showVisualExcelExport}
            sideBar={grid.sideBar}
            statusBar={grid.statusBar}
            rowHeight={grid.rowHeight}
          />
        </div>
        {guide && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/demos/markets-grid-lab/src/tabs/LabFeatureTab.tsx
git commit -m "feat(markets-grid-lab): render Inspector drawer under the grid in the shell

```

---

### Task 6: Grouped sidebar navigation

**Files:**
- Create: `apps/demos/markets-grid-lab/src/components/LabSidebarNav.tsx`

**Interfaces:**
- Consumes: `LAB_CATEGORIES` (Task 1); `getFeatureGuide` (Task 2); `@wellsfargo-starui/ui` (`Button`, `Input`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`).
- Produces: `LabSidebarNav({ items, activeId, onSelect, query, onQueryChange })` where `items: { id: string; label: string }[]`. Renders grouped, collapsible nav. **Each item button carries `data-testid="lab-tab-<id>"`** and calls `onSelect(id)`.

- [ ] **Step 1: Implement the component**

Create `apps/demos/markets-grid-lab/src/components/LabSidebarNav.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Input } from '@wellsfargo-starui/ui';
import { LAB_CATEGORIES } from '../guides/categories';

export interface LabSidebarNavItem {
  id: string;
  label: string;
}

export interface LabSidebarNavProps {
  items: LabSidebarNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function LabSidebarNav({ items, activeId, onSelect, query, onQueryChange }: LabSidebarNavProps) {
  const labelById = useMemo(() => new Map(items.map((i) => [i.id, i.label])), [items]);
  const known = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const q = query.trim().toLowerCase();

  return (
    <nav
      className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      data-testid="lab-sidebar"
    >
      <div className="relative shrink-0 px-2 py-2">
        <Search
          size={13}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-secondary)]"
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter features…"
          className="h-8 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] pl-7 text-[12px]"
          data-testid="lab-sidebar-filter"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {LAB_CATEGORIES.map((cat) => {
          const tabIds = cat.tabIds.filter((id) => known.has(id));
          const matches = q
            ? tabIds.filter((id) => (labelById.get(id) ?? id).toLowerCase().includes(q))
            : tabIds;
          if (matches.length === 0) return null;
          return (
            <NavGroup
              key={cat.id}
              groupId={cat.id}
              label={cat.label}
              tabIds={matches}
              labelById={labelById}
              activeId={activeId}
              onSelect={onSelect}
              forceOpen={q.length > 0}
            />
          );
        })}
      </div>
    </nav>
  );
}

function NavGroup({
  groupId,
  label,
  tabIds,
  labelById,
  activeId,
  onSelect,
  forceOpen,
}: {
  groupId: string;
  label: string;
  tabIds: string[];
  labelById: Map<string, string>;
  activeId: string;
  onSelect: (id: string) => void;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(true);
  const isOpen = forceOpen || open;
  return (
    <Collapsible open={isOpen} onOpenChange={setOpen} className="mt-1">
      <CollapsibleTrigger
        className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-text-primary)]"
        data-testid={`lab-nav-group-${groupId}`}
      >
        <ChevronRight size={12} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-0.5 flex flex-col">
          {tabIds.map((id) => {
            const active = id === activeId;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`lab-tab-${id}`}
                  className={`flex w-full items-center rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                    active
                      ? 'bg-[color:var(--ds-surface-secondary)] font-medium text-[color:var(--ds-text-primary)] shadow-[var(--ds-elevation-card)]'
                      : 'text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]'
                  }`}
                >
                  {labelById.get(id) ?? id}
                </button>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/demos/markets-grid-lab/src/components/LabSidebarNav.tsx
git commit -m "feat(markets-grid-lab): grouped collapsible sidebar nav with filter

```

---

### Task 7: Home landing tab

**Files:**
- Create: `apps/demos/markets-grid-lab/src/tabs/HomeTab.tsx`

**Interfaces:**
- Consumes: `LAB_CATEGORIES` (Task 1); `getFeatureGuide` (Task 2); `@wellsfargo-starui/ui` (`Card`, `CardContent`, `Badge`, `ScrollArea`); `lucide-react`.
- Produces: `HomeTab({ items, onNavigate })` where `items: { id: string; label: string }[]`, `onNavigate: (id: string) => void`.

- [ ] **Step 1: Implement the component**

Create `apps/demos/markets-grid-lab/src/tabs/HomeTab.tsx`:

```tsx
import { ArrowRight, Layers, Settings2, Save, SlidersHorizontal } from 'lucide-react';
import { Badge, Card, CardContent, ScrollArea } from '@wellsfargo-starui/ui';
import { LAB_CATEGORIES } from '../guides/categories';
import { getFeatureGuide } from '../guides/featureGuides';

export interface HomeTabItem {
  id: string;
  label: string;
}

export interface HomeTabProps {
  items: HomeTabItem[];
  onNavigate: (id: string) => void;
}

const MOUNT_SNIPPET = `import { MarketsGrid, createMarketsGridLocalStorageStorage } from '@wellsfargo-starui/grid';

const storage = createMarketsGridLocalStorageStorage();

<MarketsGrid
  gridId="positions"
  rowData={rows}
  columnDefs={columns}
  rowIdField="id"
  storage={storage}
  showProfileSelector
  showSettingsButton
/>;`;

const MENTAL_MODEL = [
  {
    icon: Layers,
    title: 'Profiles',
    body: 'A saved snapshot of every setting under a gridId. Clone, export, import.',
    tabId: 'profiles',
  },
  {
    icon: SlidersHorizontal,
    title: 'Modules',
    body: 'Feature units — conditional styling, alerts, calculated columns…',
    tabId: 'conditional',
  },
  {
    icon: Settings2,
    title: 'Settings sheet',
    body: 'The gear button — where you configure modules without code.',
    tabId: 'overview',
  },
  {
    icon: Save,
    title: 'Toolbars',
    body: 'Filters, formatting and editing surfaces for live, in-grid config.',
    tabId: 'toolbar',
  },
];

const RECOMMENDED_PATH = ['overview', 'formatting', 'conditional', 'editing', 'profiles'];

export function HomeTab({ items, onNavigate }: HomeTabProps) {
  const labelById = new Map(items.map((i) => [i.id, i.label]));
  const known = new Set(items.map((i) => i.id));

  return (
    <ScrollArea className="min-h-0 flex-1" data-testid="lab-home">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-2">
          <Badge
            variant="outline"
            className="w-fit border-[color:var(--ds-border-primary)] text-[10px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]"
          >
            Developer onboarding
          </Badge>
          <h1 className="text-[24px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
            MarketsGrid: a config-driven enterprise data grid
          </h1>
          <p className="max-w-[70ch] text-[14px] text-[color:var(--ds-text-secondary)]">
            Mount one component, then configure everything — formatting, styling, grouping,
            editing, alerts — through the grid&apos;s own UI. Settings are saved as
            <strong className="text-[color:var(--ds-text-primary)]"> profiles</strong>, so you
            ship behaviour as data, not bespoke React. This lab walks each capability with a live
            grid, steps to try, and the config behind it.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            Mount in 30 seconds
          </h2>
          <pre className="overflow-x-auto rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-3 text-[12px] leading-relaxed text-[color:var(--ds-text-primary)]">
            <code>{MOUNT_SNIPPET}</code>
          </pre>
          <p className="text-[12px] text-[color:var(--ds-text-secondary)]">
            That is the only code you write. Everything else is configured in the UI and persisted
            to the profile under <code>gridId</code>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            The mental model
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MENTAL_MODEL.map((m) => {
              const Icon = m.icon;
              const can = known.has(m.tabId);
              return (
                <Card
                  key={m.title}
                  className="cursor-pointer border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] transition-colors hover:border-[color:var(--ds-text-secondary)]"
                  onClick={() => can && onNavigate(m.tabId)}
                >
                  <CardContent className="flex flex-col gap-2 p-4">
                    <Icon size={18} className="text-[color:var(--ds-text-secondary)]" />
                    <h3 className="text-[13px] font-semibold text-[color:var(--ds-text-primary)]">{m.title}</h3>
                    <p className="text-[12px] text-[color:var(--ds-text-secondary)]">{m.body}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            Recommended path
          </h2>
          <ol className="flex flex-wrap items-center gap-2 text-[12px]">
            {RECOMMENDED_PATH.filter((id) => known.has(id)).map((id, i, arr) => (
              <li key={id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate(id)}
                  className="rounded border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2 py-1 text-[color:var(--ds-text-primary)] hover:bg-[color:var(--ds-surface-secondary)]"
                >
                  {i + 1}. {labelById.get(id) ?? id}
                </button>
                {i < arr.length - 1 && <ArrowRight size={13} className="text-[color:var(--ds-text-secondary)]" />}
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            Feature map
          </h2>
          {LAB_CATEGORIES.map((cat) => {
            const tabIds = cat.tabIds.filter((id) => id !== 'home' && known.has(id));
            if (tabIds.length === 0) return null;
            return (
              <div key={cat.id} className="flex flex-col gap-2">
                <h3 className="text-[12px] font-medium text-[color:var(--ds-text-secondary)]">{cat.label}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {tabIds.map((id) => {
                    const guide = getFeatureGuide(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onNavigate(id)}
                        data-testid={`lab-home-card-${id}`}
                        className="group flex flex-col gap-1 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-3 text-left transition-colors hover:border-[color:var(--ds-text-secondary)]"
                      >
                        <span className="flex items-center justify-between text-[13px] font-semibold text-[color:var(--ds-text-primary)]">
                          {labelById.get(id) ?? id}
                          <ArrowRight
                            size={13}
                            className="text-[color:var(--ds-text-secondary)] opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </span>
                        <span className="text-[12px] text-[color:var(--ds-text-secondary)]">
                          {guide?.summary ?? ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/demos/markets-grid-lab/src/tabs/HomeTab.tsx
git commit -m "feat(markets-grid-lab): Home landing tab (hero, mount, mental model, feature map)

```

---

### Task 8: App layout rewrite — sidebar + Home default

**Files:**
- Modify: `apps/demos/markets-grid-lab/src/App.tsx`
- Delete: `apps/demos/markets-grid-lab/src/components/LabTabsNav.tsx`

**Interfaces:**
- Consumes: `LabSidebarNav` (Task 6), `HomeTab` (Task 7), existing lazy tab components, `LabScenarioRail`, `ThemeToggle`, `LabDemoProvider`.
- Produces: new `App` with `home` default tab, sidebar-driven `Tabs`, shared filter `query` state.

- [ ] **Step 1: Replace App.tsx**

Replace the entire contents of `apps/demos/markets-grid-lab/src/App.tsx` with:

```tsx
import { lazy, Suspense, useState, type ComponentType } from 'react';
import { Tabs, TabsContent, TooltipProvider } from '@wellsfargo-starui/ui';
import { LabSidebarNav } from './components/LabSidebarNav';
import { ThemeToggle } from './components/ThemeToggle';
import { HomeTab } from './tabs/HomeTab';
import { LabDemoProvider } from './demo/LabDemoContext';
import { LabScenarioRail } from './demo/LabScenarioRail';

const OverviewTab = lazy(() => import('./tabs/OverviewTab').then((m) => ({ default: m.OverviewTab })));
const FormattingTab = lazy(() => import('./tabs/FormattingTab').then((m) => ({ default: m.FormattingTab })));
const RenderersTab = lazy(() => import('./tabs/RenderersTab').then((m) => ({ default: m.RenderersTab })));
const FormatterToolbarTab = lazy(() => import('./tabs/FormatterToolbarTab').then((m) => ({ default: m.FormatterToolbarTab })));
const ColumnGroupsTab = lazy(() => import('./tabs/ColumnGroupsTab').then((m) => ({ default: m.ColumnGroupsTab })));
const CalculatedColumnsTab = lazy(() => import('./tabs/CalculatedColumnsTab').then((m) => ({ default: m.CalculatedColumnsTab })));
const ConditionalStylingTab = lazy(() => import('./tabs/ConditionalStylingTab').then((m) => ({ default: m.ConditionalStylingTab })));
const QuickFiltersTab = lazy(() => import('./tabs/QuickFiltersTab').then((m) => ({ default: m.QuickFiltersTab })));
const LiveUpdatesTab = lazy(() => import('./tabs/LiveUpdatesTab').then((m) => ({ default: m.LiveUpdatesTab })));
const AlertsTab = lazy(() => import('./tabs/AlertsTab').then((m) => ({ default: m.AlertsTab })));
const EditingTab = lazy(() => import('./tabs/EditingTab').then((m) => ({ default: m.EditingTab })));
const BulkUpdateTab = lazy(() => import('./tabs/BulkUpdateTab').then((m) => ({ default: m.BulkUpdateTab })));
const PlusMinusTab = lazy(() => import('./tabs/PlusMinusTab').then((m) => ({ default: m.PlusMinusTab })));
const ShortcutsTab = lazy(() => import('./tabs/ShortcutsTab').then((m) => ({ default: m.ShortcutsTab })));
const ProfilesTab = lazy(() => import('./tabs/ProfilesTab').then((m) => ({ default: m.ProfilesTab })));
const VisualExcelTab = lazy(() => import('./tabs/VisualExcelTab').then((m) => ({ default: m.VisualExcelTab })));

interface TabEntry {
  id: string;
  label: string;
  hint: string;
  Component: ComponentType;
}

// Order is per-tab; the sidebar groups them via LAB_CATEGORIES. `home` is
// rendered specially (needs navigation), so it is not in this list.
const TABS: TabEntry[] = [
  { id: 'overview', label: 'Overview', hint: 'Full feature kitchen-sink', Component: OverviewTab },
  { id: 'formatting', label: 'Formatting', hint: 'Value formatters & types', Component: FormattingTab },
  { id: 'visual-excel', label: 'Visual Excel', hint: 'WYSIWYG styled .xlsx export', Component: VisualExcelTab },
  { id: 'renderers', label: 'Cell Renderers', hint: 'Visual cell components', Component: RenderersTab },
  { id: 'toolbar', label: 'Formatter Toolbar', hint: 'Live cell-style toolbar', Component: FormatterToolbarTab },
  { id: 'groups', label: 'Column Groups', hint: 'Nested header groups', Component: ColumnGroupsTab },
  { id: 'calc', label: 'Calculated', hint: 'Derived virtual columns', Component: CalculatedColumnsTab },
  { id: 'conditional', label: 'Conditional Style', hint: 'Expression-driven styling', Component: ConditionalStylingTab },
  { id: 'filters', label: 'Quick Filters', hint: 'Saved filter pill buttons', Component: QuickFiltersTab },
  { id: 'live', label: 'Live Updates', hint: 'High-frequency stream', Component: LiveUpdatesTab },
  { id: 'alerts', label: 'Alerts', hint: 'Triggers, toasts, bell + OpenFin', Component: AlertsTab },
  { id: 'editing', label: 'Editing', hint: 'Full editing family demo', Component: EditingTab },
  { id: 'bulk-update', label: 'Bulk Update', hint: 'Replace selection with one value', Component: BulkUpdateTab },
  { id: 'plus-minus', label: 'Plus / Minus', hint: 'Keyboard nudge rules', Component: PlusMinusTab },
  { id: 'shortcuts', label: 'Shortcuts', hint: 'Letter-key arithmetic', Component: ShortcutsTab },
  { id: 'profiles', label: 'Profiles', hint: 'Pre-baked configurations', Component: ProfilesTab },
];

// Sidebar items include Home (synthetic) plus every real tab.
const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  ...TABS.map(({ id, label }) => ({ id, label })),
];

const HINT_BY_ID: Record<string, string> = {
  home: 'Start here — what MarketsGrid is',
  ...Object.fromEntries(TABS.map((t) => [t.id, t.hint])),
};

function TabFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]">
      Loading tab…
    </div>
  );
}

export function App() {
  const [active, setActive] = useState<string>('home');
  const [query, setQuery] = useState('');

  return (
    <LabDemoProvider>
      <TooltipProvider delayDuration={250}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
          <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-5 pr-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-1.5 rounded-sm bg-[color:var(--ds-text-primary)]" aria-hidden />
              <h1 className="text-[15px] font-semibold tracking-tight">MarketsGrid Feature Lab</h1>
              <span className="ml-2 text-[12px] font-normal text-[color:var(--ds-text-secondary)]">
                · {HINT_BY_ID[active] ?? ''}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <LabSidebarNav
              items={NAV_ITEMS}
              activeId={active}
              onSelect={setActive}
              query={query}
              onQueryChange={setQuery}
            />

            <Tabs
              value={active}
              onValueChange={setActive}
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
              <TabsContent
                value="home"
                className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0 data-[state=inactive]:hidden"
              >
                {active === 'home' ? <HomeTab items={NAV_ITEMS} onNavigate={setActive} /> : null}
              </TabsContent>

              {TABS.map((t) => (
                <TabsContent
                  key={t.id}
                  value={t.id}
                  className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden"
                >
                  {active === t.id ? (
                    <Suspense fallback={<TabFallback />}>
                      <t.Component />
                    </Suspense>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>

            <LabScenarioRail activeTab={active} />
          </div>
        </div>
      </TooltipProvider>
    </LabDemoProvider>
  );
}
```

- [ ] **Step 2: Delete the obsolete horizontal nav**

Run: `git rm apps/demos/markets-grid-lab/src/components/LabTabsNav.tsx`
Expected: file removed. (Confirm nothing else imports it.)

Run: `grep -rn "LabTabsNav" apps/demos/markets-grid-lab/src || echo "no references"`
Expected: `no references`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Build the app to confirm it bundles**

Run: `npm --prefix apps run build -w @wellsfargo-starui/markets-grid-lab`
Expected: Vite build succeeds (no unresolved imports).

- [ ] **Step 5: Commit**

```bash
git add apps/demos/markets-grid-lab/src/App.tsx
git rm --cached apps/demos/markets-grid-lab/src/components/LabTabsNav.tsx 2>/dev/null || true
git commit -m "feat(markets-grid-lab): sidebar layout + Home default; drop horizontal tab strip

```

---

### Task 9: Smoke e2e, docs, and full verification

**Files:**
- Create: `e2e/lab-onboarding.spec.ts`
- Modify: `docs/current-features.md`

**Interfaces:**
- Consumes: the running lab on `http://localhost:5300` (Playwright `webServer` boots it).

- [ ] **Step 1: Write the smoke spec**

Create `e2e/lab-onboarding.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const LAB_URL = 'http://localhost:5300/';

test.describe('markets-grid-lab onboarding', () => {
  test('home is the default landing and shows the feature map', async ({ page }) => {
    await page.goto(LAB_URL);
    await expect(page.getByTestId('lab-home')).toBeVisible();
    await expect(page.getByRole('heading', { name: /config-driven enterprise data grid/i })).toBeVisible();
    await expect(page.getByTestId('lab-home-card-overview')).toBeVisible();
  });

  test('sidebar groups render and a feature tab mounts its grid + inspector', async ({ page }) => {
    await page.goto(LAB_URL);
    await expect(page.getByTestId('lab-nav-group-formatting-display')).toBeVisible();

    await page.getByTestId('lab-tab-conditional').click();

    // Grid surface mounts.
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 20_000 });

    // Inspector is present; switch to the Config tab and confirm a code block.
    await expect(page.getByTestId('lab-inspector')).toBeVisible();
    await page.getByTestId('lab-inspector-tab-config').click();
    await expect(page.getByText('Mount props (chrome)')).toBeVisible();
  });

  test('sidebar filter narrows the nav', async ({ page }) => {
    await page.goto(LAB_URL);
    await page.getByTestId('lab-sidebar-filter').fill('alerts');
    await expect(page.getByTestId('lab-tab-alerts')).toBeVisible();
    await expect(page.getByTestId('lab-tab-overview')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the smoke spec**

Run: `npx playwright test e2e/lab-onboarding.spec.ts --project=chromium`
Expected: 3 passed. (Playwright boots the lab on :5300 via `webServer`; first run may take up to 2 min to start the dev server.)

If the grid selector `.ag-root-wrapper` differs, confirm the actual root class by inspecting a passing existing lab spec's grid locator (`e2e/helpers/labEditing.ts` `gridAt`) and adjust. Re-run until green.

- [ ] **Step 3: Update the feature inventory**

Edit `docs/current-features.md` — find the `markets-grid-lab` app section (search for "markets-grid-lab"; if there is no per-app section, add bullets under the demos/apps area). Add these bullets:

```markdown
- `apps/demos/markets-grid-lab` — **Home landing tab** (`HomeTab`): hero, 30-second mount snippet, config-driven mental-model cards, recommended path, and a category feature map linking to every tab.
- `apps/demos/markets-grid-lab` — **grouped sidebar nav** (`LabSidebarNav`) with a feature filter, replacing the horizontal tab strip; nav items keep `data-testid="lab-tab-<id>"`.
- `apps/demos/markets-grid-lab` — **Inspector drawer** (`InspectorDrawer`) under every feature grid: What/Why, Try-this steps, derived Config blocks, and a Props/API table.
- `apps/demos/markets-grid-lab` — **feature-guide registry** (`guides/featureGuides.ts`, `FeatureGuide`) and config-block derivation (`buildConfigBlocks`) sourced from each tab's `LabFeatureConfig` and seed rules.
```

- [ ] **Step 4: Run the full lab unit-test suite**

Run: `npx vitest run apps/demos/markets-grid-lab/src/`
Expected: all lab tests pass (existing `data/*.test.ts` + the three new `guides/*.test.ts`).

- [ ] **Step 5: Final typecheck + build**

Run: `npx tsc --noEmit -p apps/demos/markets-grid-lab/tsconfig.json && npm --prefix apps run build -w @wellsfargo-starui/markets-grid-lab`
Expected: no type errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add e2e/lab-onboarding.spec.ts docs/current-features.md
git commit -m "test(markets-grid-lab): onboarding smoke spec; docs: feature inventory

```

---

## Self-Review

**Spec coverage:**
- IA / grouped sidebar → Task 1 (categories), Task 6 (`LabSidebarNav`), Task 8 (App layout). ✓
- Feature-page shell (Layout A: grid + bottom Inspector) → Task 4 (`InspectorDrawer`), Task 5 (`LabFeatureTab`). ✓
- Per-feature content (Config from seeds, What/Why from help, Try-this, Props) → Task 2 (registry, props, whatWhy), Task 3 (derived config + seed extraConfig), Task 4 (renders all four). What/Why is authored in the guide (concise) with the existing help markdown surfaced via the drawer's "Full docs" disclosure. ✓
- Home landing (hero, mount snippet, mental model, feature map, recommended path) → Task 7. ✓
- Reconciliation (LabFeatureTab evolves, help md feeds drawer, LabScenarioRail untouched, LabTabsNav replaced) → Tasks 5, 8. ✓
- Config-driven framing → copy in Tasks 2 & 7. ✓
- Testing (serializer unit, registry completeness, derivation unit, Playwright smoke, docs update) → Tasks 1, 2, 3, 9. ✓
- Non-goals respected: no new grid features, no backend, no mobile redesign, no tour overlay. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; the only "fill from existing source" is the conditional/live `extraConfig`, which names the exact verified exports (`CONDITIONAL_TAB_CS_RULES`, `LIVE_TAB_CS_RULES`). ✓

**Type consistency:** `FeatureGuide`, `FeatureGuidePropRow`, `FeatureGuideConfigBlock`, `LabCategoryId` defined in Task 1 and consumed unchanged in Tasks 2–7. `buildConfigBlocks(config, guide?)` signature matches its call in Task 5. `LabSidebarNav` and `HomeTab` prop shapes (`items`, `onSelect`/`onNavigate`, `query`/`onQueryChange`) match their App usage in Task 8. Nav testid `lab-tab-<id>` preserved (global constraint) and asserted in Task 9. ✓

**Risk note for the implementer:** the e2e grid-root selector (`.ag-root-wrapper`) and exact lab boot time are the most likely sources of a flaky first run — Step 2 of Task 9 says how to confirm the real selector against existing specs.
