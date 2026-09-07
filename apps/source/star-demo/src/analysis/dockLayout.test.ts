import { describe, expect, it, vi } from 'vitest';
import type { ReportBlock } from '@wellsfargo-starui/data';
import type { LayoutNode, PreventableDockEvent } from '@widgetstools/dock-manager-core';
import { blockIndexOf, buildDockState, BLOCK_WIDGET_TYPE, panelIdFor, preventsStacking } from './dockLayout';

const block = (over: Partial<ReportBlock> = {}): ReportBlock =>
  ({ kind: 'commentary', text: 'x', ...over }) as ReportBlock;

/** Every tab group in the tree, in left-to-right order. */
function groups(node: LayoutNode): Array<{ id: string; panels: string[] }> {
  if (node.type === 'tabgroup') return [{ id: node.id, panels: node.panels }];
  return node.children.flatMap(groups);
}

function columns(node: LayoutNode): LayoutNode[] {
  return node.type === 'split' && node.direction === 'horizontal' ? node.children : [node];
}

describe('the opening arrangement', () => {
  it('gives every block a panel the widget registry can render', () => {
    const state = buildDockState([block(), block()]);
    expect([...state.panels.keys()]).toEqual([panelIdFor(0), panelIdFor(1)]);
    for (const panel of state.panels.values()) {
      expect(panel.widgetType).toBe(BLOCK_WIDGET_TYPE);
    }
  });

  /** The dock requires a placement per panel; a panel without one is a panel
   *  that never appears. */
  it('places every panel in the group that holds it', () => {
    const state = buildDockState([block({ region: 'left' }), block(), block({ region: 'right' })]);
    for (const [id] of state.panels) {
      const placement = state.placements.get(id);
      expect(placement).toBeDefined();
      expect(placement).toMatchObject({ type: 'docked' });
    }
    // And every group named by a placement actually exists in the tree.
    const known = new Set(groups(state.layout).map((g) => g.id));
    for (const placement of state.placements.values()) {
      if (placement.type === 'docked') expect(known.has(placement.groupId)).toBe(true);
    }
  });

  /**
   * Tiles, never tabs. The same dock runs the blotter's summary panel, where
   * stacking widgets into one tabbed sidebar is right — they are alternatives.
   * Dashboard blocks are read together, so each gets its own group.
   */
  it('gives each block its own group rather than stacking them', () => {
    const state = buildDockState([block(), block(), block()]);
    const all = groups(state.layout);
    expect(all).toHaveLength(3);
    for (const g of all) expect(g.panels).toHaveLength(1);
  });

  it('opens one column per populated region, left to right', () => {
    const state = buildDockState([block({ region: 'left' }), block(), block({ region: 'right' })]);
    expect(columns(state.layout)).toHaveLength(3);
  });

  /** A main-only report must not be a middle third with two empty gutters. */
  it('gives the rails no width when nothing is in them', () => {
    const state = buildDockState([block(), block()]);
    expect(columns(state.layout)).toHaveLength(1);
  });

  /** The dock's own invariant: a split's sizes must sum to 100. */
  it('always splits into shares that sum to exactly 100', () => {
    const check = (node: LayoutNode): void => {
      if (node.type !== 'split') return;
      expect(node.sizes.reduce((a, b) => a + b, 0)).toBe(100);
      expect(node.sizes).toHaveLength(node.children.length);
      node.children.forEach(check);
    };
    check(buildDockState([block({ region: 'left' }), block({ kind: 'chart', query: {} } as Partial<ReportBlock>), block({ kind: 'table', query: {} } as Partial<ReportBlock>), block({ region: 'right' })]).layout);
    // Odd counts are where rounding drift shows up.
    check(buildDockState([block(), block(), block(), block(), block(), block(), block()]).layout);
  });

  /** A chart given a commentary's share is a slot, not a chart — the axis
   *  labels alone eat it. */
  it('opens a chart with more height than a line of prose', () => {
    const state = buildDockState([block({ kind: 'chart', query: {} } as Partial<ReportBlock>), block()]);
    const split = state.layout;
    expect(split.type).toBe('split');
    if (split.type === 'split') expect(split.sizes[0]).toBeGreaterThan(split.sizes[1]);
  });

  it('treats an unknown region as main rather than losing the block', () => {
    const state = buildDockState([block({ region: 'footer' } as unknown as Partial<ReportBlock>)]);
    expect(state.panels.size).toBe(1);
    expect(groups(state.layout)).toHaveLength(1);
  });

  it('produces a mountable state for a report with no blocks', () => {
    const state = buildDockState([]);
    expect(state.panels.size).toBe(0);
    expect(state.layout.type).toBe('tabgroup');
  });

  /** A dashboard block is not a document — removing one is a change to the
   *  report, not a stray click on an ✕. */
  it('makes panels movable but not closable', () => {
    const panel = [...buildDockState([block()]).panels.values()][0];
    expect(panel.closable).toBe(false);
    expect(panel.dockable).toBe(true);
    expect(panel.allowMaximize).toBe(true);
  });
});

describe('panel identity', () => {
  it('round-trips a block index through its panel id', () => {
    for (const i of [0, 3, 15]) expect(blockIndexOf(panelIdFor(i))).toBe(i);
  });

  /** A layout saved against a different set of blocks names panels that no
   *  longer resolve; that must read as "unknown", not as block 0. */
  it('reports an unrecognisable panel id rather than guessing', () => {
    expect(blockIndexOf('summary-widget-a')).toBeUndefined();
    expect(blockIndexOf('block-')).toBeUndefined();
    expect(blockIndexOf('block--1')).toBeUndefined();
  });
});

/**
 * The one drop that would hide a block: dropping a panel onto another's centre
 * merges them into a tab group, and whichever tab is not selected shows
 * nothing.
 */
describe('refusing to stack panels', () => {
  const event = () => ({ preventDefault: vi.fn(), defaultPrevented: false }) as unknown as PreventableDockEvent;

  it('refuses a centre drop', () => {
    const e = event();
    expect(preventsStacking(e, 'center')).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('allows every edge drop, which splits instead of stacking', () => {
    for (const position of ['left', 'right', 'top', 'bottom'] as const) {
      const e = event();
      expect(preventsStacking(e, position)).toBe(false);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
  });
});
