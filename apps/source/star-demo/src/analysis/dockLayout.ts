/**
 * How a dashboard is arranged before anyone has moved anything.
 *
 * A dashboard is composed in a semantic vocabulary — "this is context, put it
 * on the left"; "this is the headline" — because that is what a model can
 * author well and what a person can read back. The dock manager wants a tree
 * of splits. This is the one-way translation between them.
 *
 * One-way is the whole point. This runs only when a spec carries no saved
 * `dock` layout; once one exists it is restored verbatim. Re-deriving would
 * silently undo every arrangement on the next load, which is the failure mode
 * that makes draggable dashboards feel broken.
 *
 * **Tiles, never tabs.** The same dock manager runs the blotter's summary
 * panel, where stacking widgets into one tabbed sidebar is exactly right: they
 * are alternatives, and the blotter is what you are actually reading. A
 * dashboard is the opposite — the blocks are meant to be taken in together,
 * and a chart hidden behind a tab is a chart nobody reads. So every panel gets
 * its own group, and `preventsStacking` below refuses the drop that would
 * merge two.
 */
import type { ReportBlock } from '@wellsfargo-starui/data';
import type {
  DockManagerState,
  DockPosition,
  LayoutNode,
  PanelConfig,
  Placement,
  PreventableDockEvent,
} from '@widgetstools/dock-manager-core';

/** The widget registry key every dashboard panel renders through. */
export const BLOCK_WIDGET_TYPE = 'report-block';

/** Panels are addressed by block index, so a layout only means anything
 *  alongside the blocks it was saved with. */
export const panelIdFor = (index: number): string => `block-${index}`;

export function blockIndexOf(panelId: string): number | undefined {
  // Matched, not stripped: stripping leaves `Number('') === 0` for "block-",
  // which reads as block 0 and silently addresses the wrong panel.
  const digits = /^block-(\d+)$/.exec(panelId);
  return digits ? Number(digits[1]) : undefined;
}

/** Share of the width each rail takes when it holds anything. */
const RAIL_WIDTH_PCT = 22;

/**
 * Opening share of a region's height per kind.
 *
 * A chart given a commentary's share is a slot, not a chart — the axis labels
 * alone eat it. These are only a starting point: the first drag overrides them
 * for good.
 */
const WEIGHT: Record<string, number> = {
  kpis: 1,
  commentary: 1,
  chart: 2.2,
  lanes: 2,
  table: 2.4,
  pivot: 2.4,
};

function panelConfig(block: ReportBlock, index: number, editable: boolean): PanelConfig {
  return {
    id: panelIdFor(index),
    title: block.title ?? block.band ?? `Block ${index + 1}`,
    widgetType: BLOCK_WIDGET_TYPE,
    widgetProps: { index },
    // A dashboard block is not a document to be closed — removing one is a
    // change to the report, made through the assistant, not a stray click on
    // an ✕. Everything that only MOVES or RESIZES it is allowed.
    closable: false,
    // A read-only report still renders its blocks; it just cannot be
    // rearranged. `disabled` is the dock's own single switch for that.
    disabled: !editable,
    dockable: editable,
    allowDocking: editable,
    floatable: editable,
    allowPinning: false,
    allowMaximize: editable,
    minimumWidth: 160,
    minimumHeight: 80,
  };
}

/** Percentages that sum to exactly 100, so the dock's own invariant holds. */
function sharesFrom(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / total) * 100);
  const rounded = raw.map((n) => Math.max(1, Math.round(n)));
  // Rounding drifts; give the remainder to the largest so the sum is exact.
  const drift = 100 - rounded.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    const largest = rounded.indexOf(Math.max(...rounded));
    rounded[largest] += drift;
  }
  return rounded;
}

/** One column of the dashboard: each block its own group, stacked vertically. */
function columnFor(
  region: string,
  entries: ReadonlyArray<{ block: ReportBlock; index: number }>,
): LayoutNode {
  const groups: LayoutNode[] = entries.map(({ index }) => ({
    type: 'tabgroup',
    id: `${region}-group-${index}`,
    panels: [panelIdFor(index)],
    activePanel: panelIdFor(index),
  }));
  if (groups.length === 1) return groups[0];
  return {
    type: 'split',
    id: `${region}-column`,
    direction: 'vertical',
    children: groups,
    sizes: sharesFrom(entries.map(({ block }) => WEIGHT[block.kind] ?? 1.5)),
  };
}

/**
 * The opening arrangement for a set of blocks.
 *
 * Rails take a fixed share of the width when they hold anything and none when
 * they do not — so a main-only report is full width rather than a middle third
 * with two empty gutters.
 */
export function buildDockState(
  blocks: readonly ReportBlock[],
  { editable = true }: { editable?: boolean } = {},
): DockManagerState {
  const panels = new Map<string, PanelConfig>();
  const placements = new Map<string, Placement>();

  const byRegion: Record<string, Array<{ block: ReportBlock; index: number }>> = {
    left: [],
    main: [],
    right: [],
  };
  blocks.forEach((block, index) => {
    const region = (block.region ?? 'main') in byRegion ? (block.region ?? 'main') : 'main';
    byRegion[region].push({ block, index });
  });

  const columns: LayoutNode[] = [];
  const weights: number[] = [];
  for (const region of ['left', 'main', 'right'] as const) {
    const entries = byRegion[region];
    if (entries.length === 0) continue;
    const column = columnFor(region, entries);
    columns.push(column);
    weights.push(region === 'main' ? 100 - RAIL_WIDTH_PCT : RAIL_WIDTH_PCT);
  }

  // Every panel is docked into the group that holds it, whichever column that
  // turned out to be — the dock requires a placement per panel.
  const assign = (node: LayoutNode): void => {
    if (node.type === 'tabgroup') {
      for (const id of node.panels) placements.set(id, { type: 'docked', groupId: node.id });
      return;
    }
    node.children.forEach(assign);
  };

  blocks.forEach((block, index) => panels.set(panelIdFor(index), panelConfig(block, index, editable)));

  const layout: LayoutNode =
    columns.length === 0
      ? { type: 'tabgroup', id: 'empty', panels: [], activePanel: '' }
      : columns.length === 1
        ? columns[0]
        : { type: 'split', id: 'report-root', direction: 'horizontal', children: columns, sizes: sharesFrom(weights) };

  assign(layout);

  return {
    layout,
    panels,
    placements,
    activePaneId: blocks.length > 0 ? panelIdFor(0) : '',
    nextZIndex: 100,
  };
}

/**
 * Refuses the one drop that would hide a block: dropping a panel onto another
 * panel's centre merges them into a tab group, and whichever tab is not
 * selected then shows nothing. Every edge drop — left, right, top, bottom —
 * splits instead, and is allowed.
 */
export function preventsStacking(event: PreventableDockEvent, position: DockPosition): boolean {
  if (position !== 'center') return false;
  event.preventDefault();
  return true;
}
