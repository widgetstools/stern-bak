import { describe, expect, it, vi } from 'vitest';
import { createTimedRuleStore } from '@wellsfargo-starui/engine';
import { createTimedActivations } from './timedActivations.js';
import type { TriggerCache } from './triggerCache.js';

/**
 * Contract under test: the streaming (delta) pass must touch ONLY the
 * rows the RowChangeBus delivered — the old shape forEachNode-scanned
 * all rows × all known paths per flush (~8M path reads/sec with one
 * timed rule armed on a 20k-row blotter).
 */

type Node = { id: string; data: Record<string, unknown> };

function makeNode(id: string, data: Record<string, unknown>): Node {
  return { id, data };
}

function makeHarness(nodes: Node[]) {
  const forEachNode = vi.fn((cb: (n: Node) => void) => {
    for (const n of nodes) cb(n);
  });
  const api = {
    forEachNode,
    getColumns: () => [{ getColId: () => 'price' }],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const evaluated: string[] = [];
  const engine = {
    parseAndEvaluate: vi.fn((_expr: string, ctx: { data?: Record<string, unknown> }) => {
      evaluated.push(String(ctx.data?.__id ?? '?'));
      return true; // every evaluated row matches → activates
    }),
  };
  const rule = {
    id: 'r1',
    enabled: true,
    activeDurationMs: 5_000,
    expression: '[price] > 0',
    scope: { type: 'row' as const },
  };
  const platform = {
    api: { api },
    getState: () => ({ rules: [rule] }),
    resources: { expression: () => engine },
  };
  const triggers = { get: () => new Set(['price']) } as unknown as TriggerCache;
  const deps = {
    // Per-harness store — timed state is per-grid now, so tests don't
    // need (and can't use) a global clear between cases.
    store: createTimedRuleStore(),
    triggers,
    diffCacheByApi: new WeakMap(),
    scheduleRefresh: vi.fn(),
    scheduleTargetedRefresh: vi.fn(),
    armNextExpiry: vi.fn(),
    evaluate: vi.fn(),
  };
  const timed = createTimedActivations(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deps as any,
  );
  return { timed, forEachNode, evaluated, deps };
}

describe('processTimedActivations — delta vs full pass', () => {
  it('delta pass touches ONLY delivered rows and never forEachNode-scans the model', () => {
    const nodes = [
      makeNode('a', { __id: 'a', price: 1 }),
      makeNode('b', { __id: 'b', price: 2 }),
      makeNode('c', { __id: 'c', price: 3 }),
    ];
    const { timed, forEachNode, evaluated, deps } = makeHarness(nodes);

    timed.processTimedActivations({
      added: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updated: [nodes[1] as any],
      removed: [],
      full: false,
    });

    expect(forEachNode).not.toHaveBeenCalled();
    expect(evaluated).toEqual(['b']);
    expect(deps.armNextExpiry).toHaveBeenCalled(); // rule matched → activated
  });

  it('full pass (no change / structural) walks the whole model', () => {
    const nodes = [
      makeNode('a', { __id: 'a', price: 1 }),
      makeNode('b', { __id: 'b', price: 2 }),
    ];
    const { timed, forEachNode, evaluated } = makeHarness(nodes);

    timed.processTimedActivations();

    expect(forEachNode).toHaveBeenCalledTimes(1);
    expect(evaluated.sort()).toEqual(['a', 'b']);
  });

  it('delta pass with unchanged values evaluates nothing (diff-gated)', () => {
    const nodes = [makeNode('a', { __id: 'a', price: 1 })];
    const { timed, evaluated } = makeHarness(nodes);

    // Seed the snapshot via one pass, then deliver the SAME row again.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timed.processTimedActivations({ added: [nodes[0] as any], updated: [], removed: [], full: false });
    evaluated.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timed.processTimedActivations({ added: [], updated: [nodes[0] as any], removed: [], full: false });

    expect(evaluated).toEqual([]); // no path changed → no rule evaluation
  });
});
