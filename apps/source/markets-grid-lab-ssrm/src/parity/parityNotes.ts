/**
 * SSRM parity, feature by feature — the reason this app exists.
 *
 * Each entry is the honest status of one lab tab when the SAME
 * `LabFeatureConfig` runs against the server-side row model, with the
 * mechanism behind every gap. Grounded in the SSRM handoff
 * (docs/superpowers/plans/2026-09-11-ssrm-hardening-handoff.md), the grid's
 * honesty locks, and what this app exercises live; `parityNotes.test.ts`
 * pins one entry per tab so a new lab tab cannot ship without a verdict.
 */

export type ParityStatus = 'full' | 'partial' | 'gap';

export interface ParityEntry {
  tabId: string;
  label: string;
  status: ParityStatus;
  /** One line for the matrix. */
  summary: string;
  /** The mechanisms — what works, what doesn't, and why. */
  notes: string[];
}

export const PARITY: ParityEntry[] = [
  {
    tabId: 'overview',
    label: 'Overview',
    status: 'full',
    summary: 'Full chrome; counts and aggregations come from the engine instead of row walks.',
    notes: [
      'Status bar panels are the engine-backed SSRM set (total / filtered / selected / aggregation) — same ag-status chrome, numbers from getRowCount/getAggregates, dash until the first answer.',
      'Header select-all uses server-side selection state; selected counts resolve group trees via engine __count.',
      'Row grouping is engine-side, one level per request; group rows show engine child counts.',
      'Pivot works from the columns tool panel (engine pivots grouped views; | field separator).',
    ],
  },
  {
    tabId: 'formatting',
    label: 'Formatting',
    status: 'full',
    summary: 'Value formatters are client-side rendering — identical over loaded block rows.',
    notes: [
      'Excel format strings, Intl formatters and tick flashes all run on rendered cells; the row model changes where rows come from, not how cells paint.',
      'Date columns are declared dateString in the engine schema, so date filters/sorts run on the numeric epoch shadow rather than lexicographic strings.',
    ],
  },
  {
    tabId: 'visual-excel',
    label: 'Visual Excel',
    status: 'full',
    summary: 'Exports drain the filtered book from the engine — never just loaded blocks.',
    notes: [
      'exportSsrmVisualExcel pulls all matching rows via chunked getRows (refused above 250k rows) and runs the same styling pipeline on a hidden grid.',
      'A selection export honours server-side selection state, including group-selection trees.',
    ],
  },
  {
    tabId: 'renderers',
    label: 'Cell Renderers',
    status: 'partial',
    summary: 'All renderers paint; synthetic valueGetter columns are locked for sort/filter.',
    notes: [
      'Pills, heatmaps, percent bars, trend arrows render from block row data exactly as CSRM.',
      'KRD sparkline and bid/ask width are client valueGetters with no engine column — sorting/filtering them would silently order by nothing, so they carry the staruiSsrmClientExpr brand and the honesty lock disables sort/filter/group with a tooltip.',
      'The KRD inputs (krd1Y…krd30Y) ride the engine schema so the sparkline has data on every loaded row.',
    ],
  },
  {
    tabId: 'toolbar',
    label: 'Formatter Toolbar',
    status: 'full',
    summary: 'Live cell/header painting is customizer state — row-model agnostic.',
    notes: [
      'Formatter toolbar writes module state applied through colDef transforms; identical under SSRM.',
    ],
  },
  {
    tabId: 'groups',
    label: 'Column Groups',
    status: 'full',
    summary: 'Header groups are pure column-def structure — identical.',
    notes: [
      'Column groups, visibility and pinning are client concerns; profile save/restore works, including SSRM group-expansion restore via isServerSideGroupOpenByDefault.',
    ],
  },
  {
    tabId: 'calc',
    label: 'Calculated Columns',
    status: 'partial',
    summary: 'Computed per loaded row; sort/filter/group locked — the engine has no expressions.',
    notes: [
      'Expressions evaluate client-side on each loaded row, so values render exactly as CSRM.',
      'Sort / filter / row-group on a calculated column are locked (silent-wrong otherwise); the customizer editor names the tier (SSRM TIER chip).',
      'SUM/AVG/MIN/MAX/COUNT inside expressions read engine-wide totals via the aggregates RPC — not loaded-block statistics. MEDIAN/STDEV/VARIANCE/DISTINCT_COUNT still walk loaded rows only.',
      'Engine-compiled expressions land with phases T1/T3/T4 of the engine enhancement plan (Rust plan §12).',
    ],
  },
  {
    tabId: 'conditional',
    label: 'Conditional Styling',
    status: 'partial',
    summary: 'Rules style what is on screen — loaded rows only, which is correct but narrower.',
    notes: [
      'Styling rules and indicators evaluate on rendered rows: viewport-scoped is the honest semantic (they paint what you see).',
      'Rules never see unloaded rows, so a "count of rows matching a style" intuition does not transfer; use engine-backed counts instead.',
      'Transaction-first ticks keep flash/timed activations working (asyncTransactionsFlushed fires).',
    ],
  },
  {
    tabId: 'filters',
    label: 'Quick Filters',
    status: 'full',
    summary: 'Pills filter engine-side; badges count the whole book via the engine.',
    notes: [
      'Saved-filter pills apply their model to block requests; badge counts come from getRowCount per pill (tick-gated: zero RPCs at idle).',
      'Set-filter value lists are engine-supplied and scoped to other filters and the quick search.',
      'Quick search is multi-word AND-of-OR across every text column, matched in the worker.',
    ],
  },
  {
    tabId: 'live',
    label: 'Live Updates',
    status: 'full',
    summary: 'Ticks apply as transactions; refreshes only when position could change.',
    notes: [
      'Engine deltas arrive as applyServerSideTransactionAsync updates (cell flash, alerts and styling all fire); removals apply as remove transactions.',
      'Sorted/filtered/grouped views refresh positionally on a throttle instead of per tick — measured 0 long tasks at 10k updates/s unsorted.',
      'The demo rail pauses/paces the feed through provider.restart (mock soft-restart).',
    ],
  },
  {
    tabId: 'alerts',
    label: 'Alerts',
    status: 'partial',
    summary: 'Alerts fire on loaded rows only — an unloaded row cannot trigger.',
    notes: [
      'Data-change alert rules listen to grid transactions, so they evaluate rows the grid holds: scrolled-away blocks that were purged do not tick client-side.',
      'The alerts settings band states evaluation is loaded (visible) rows — the honest label, not a silent gap.',
      'Book-wide alerting lands with phase T5 (view membership deltas) of the engine enhancement plan (Rust plan §12).',
    ],
  },
  {
    tabId: 'editing',
    label: 'Editing',
    status: 'full',
    summary: 'The whole family persists through the engine write path — undo/redo included.',
    notes: [
      'Cell edits, fills and pastes coalesce into ssrm-apply-edits; the worker edit overlay holds them over stale feed resends, and every window on the provider sees them.',
      'Smart Edit and every editing-core patch path (applyPatches seam) persist via the SSRM edit writer the surface attaches (plan §12 C1) — the same write path pastes use.',
      'Undo/redo flows through the same seam: an undo applies the inverse patches as an ordinary engine write (plan §12 C2).',
      'A paste that would land on unloaded block placeholders is refused with a warning rather than silently partial.',
    ],
  },
  {
    tabId: 'bulk-update',
    label: 'Bulk Update',
    status: 'full',
    summary: 'Writes persist through the engine edit writer — enabled under SSRM.',
    notes: [
      'Bulk update funnels through the editing-core applyPatches seam, which now also writes ssrm-apply-edits when the surface attached the engine writer (plan §12 C1) — loaded rows repaint immediately, the engine holds the values, every window sees them.',
      'Without a write-capable provider (no applyEdits) the honest disable still stands.',
    ],
  },
  {
    tabId: 'plus-minus',
    label: 'Plus / Minus',
    status: 'full',
    summary: 'Keyboard nudges persist through the engine edit writer.',
    notes: [
      'Same applyPatches seam as bulk update — the nudge paints and persists via ssrm-apply-edits; the worker overlay holds it over feed resends.',
      'Without the engine writer the nudge stays disabled rather than silently non-persistent.',
    ],
  },
  {
    tabId: 'shortcuts',
    label: 'Shortcuts',
    status: 'full',
    summary: 'Letter-key arithmetic persists through the engine edit writer.',
    notes: [
      'Same applyPatches seam — writes land engine-side like a paste.',
      'Without the engine writer the shortcut keys stay disabled.',
    ],
  },
  {
    tabId: 'profiles',
    label: 'Profiles',
    status: 'full',
    summary: 'Profiles are customizer + grid state — row-model agnostic, including expansion.',
    notes: [
      'Formatting, styling, calculated and filter state save/restore identically.',
      'Grid state restores under SSRM including expanded groups (captured from loaded nodes, replayed via isServerSideGroupOpenByDefault as rows load).',
    ],
  },
];

export function parityFor(tabId: string): ParityEntry | undefined {
  return PARITY.find((p) => p.tabId === tabId);
}
