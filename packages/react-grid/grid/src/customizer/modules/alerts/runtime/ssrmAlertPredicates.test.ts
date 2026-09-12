import { describe, expect, it, vi } from 'vitest';
import { ExpressionEngine } from '@wellsfargo-starui/core';
import type { GridApi } from 'ag-grid-community';
import type { SsrmTickPayload } from '@wellsfargo-starui/data/runtime';
import { SSRM_SESSION_KEY } from '../../../../ssrm/ssrmSession.js';
import { bindSsrmAlertPredicates } from './ssrmAlertPredicates.js';
import type { AlertDispatcher } from './dispatch.js';

type TickHandler = (payload: SsrmTickPayload) => void;

function rule(id: string, expression: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    enabled: true,
    priority: 1,
    severity: 'warning',
    trigger: { kind: 'dataChange', expression },
    message: 'hit {rowId}',
    channels: ['toast'],
    ...extra,
  };
}

function harness(rules: unknown[]) {
  let tick: TickHandler = () => undefined;
  const provider = {
    watchPredicate: vi.fn().mockResolvedValue(undefined),
    unwatchPredicate: vi.fn().mockResolvedValue(undefined),
    onSsrmTick: (h: TickHandler) => { tick = h; return () => undefined; },
  };
  const api = { [SSRM_SESSION_KEY]: { provider } } as unknown as GridApi;
  const listeners: Array<() => void> = [];
  const state = { rules };
  const platform = {
    getState: () => state,
    subscribe: (fn: () => void) => { listeners.push(fn); return () => undefined; },
    resources: { expression: () => new ExpressionEngine() },
  };
  const dispatcher = { dispatch: vi.fn() } as unknown as AlertDispatcher & { dispatch: ReturnType<typeof vi.fn> };
  const engineWatched = new Set<string>();
  return {
    provider, api, platform, dispatcher, engineWatched, state,
    fire: (payload: SsrmTickPayload) => tick(payload),
    rulesChanged: () => listeners.forEach((fn) => fn()),
  };
}

describe('bindSsrmAlertPredicates', () => {
  it('registers compiled dataChange rules as engine watches; leaves the rest client-side', () => {
    const h = harness([
      rule('r-compiled', '[mv] > 1000'),
      rule('r-diffref', 'value > oldValue'), // diff refs are outside the wire grammar
      rule('r-scoped', '[mv] > 5', { trigger: { kind: 'dataChange', expression: '[mv] > 5', column: 'mv' } }),
      rule('r-disabled', '[mv] > 1', { enabled: false }),
    ]);
    const dispose = bindSsrmAlertPredicates(h.platform as never, h.api, h.dispatcher, h.engineWatched);
    expect(h.provider.watchPredicate).toHaveBeenCalledTimes(1);
    expect(h.provider.watchPredicate).toHaveBeenCalledWith({
      ruleId: 'r-compiled',
      expr: { k: 'bin', op: 'gt', l: { k: 'col', name: 'mv' }, r: { k: 'lit', v: 1000 } },
    });
    // The client evaluator must skip exactly the engine-watched rule.
    expect([...h.engineWatched]).toEqual(['r-compiled']);
    dispose();
    expect(h.provider.unwatchPredicate).toHaveBeenCalledWith('r-compiled');
    expect(h.engineWatched.size).toBe(0);
  });

  it('dispatches every entered row of a viewDelta through the dispatcher', () => {
    const h = harness([rule('r1', '[mv] > 1000')]);
    bindSsrmAlertPredicates(h.platform as never, h.api, h.dispatcher, h.engineWatched);
    h.fire({
      kind: 'viewDelta',
      ruleId: 'r1',
      entered: ['a', 'b', 'c'],
      left: [],
      // Only two of three entered rows were materialized (engine cap).
      rows: [{ __key: 'a', mv: 2000 }, { __key: 'b', mv: 3000 }],
    });
    const rowIds = h.dispatcher.dispatch.mock.calls.map((c) => (c[1] as { rowId: string }).rowId);
    expect(rowIds.sort()).toEqual(['a', 'b', 'c']);
    // Unknown rule / other payload kinds are ignored.
    h.dispatcher.dispatch.mockClear();
    h.fire({ kind: 'viewDelta', ruleId: 'nope', entered: ['x'], left: [], rows: [] });
    h.fire({ kind: 'rowDelta', upserts: [] });
    expect(h.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('re-syncs on rule changes: disabling unwatches, rewording re-registers', () => {
    const h = harness([rule('r1', '[mv] > 1000')]);
    bindSsrmAlertPredicates(h.platform as never, h.api, h.dispatcher, h.engineWatched);
    h.state.rules = [rule('r1', '[mv] > 2000')];
    h.rulesChanged();
    expect(h.provider.unwatchPredicate).toHaveBeenCalledWith('r1');
    expect(h.provider.watchPredicate).toHaveBeenCalledTimes(2);
    h.state.rules = [rule('r1', '[mv] > 2000', { enabled: false })];
    h.rulesChanged();
    expect(h.engineWatched.size).toBe(0);
  });

  it('is a no-op without a provider that supports predicate watches', () => {
    const api = {} as GridApi;
    const h = harness([rule('r1', '[mv] > 1')]);
    const dispose = bindSsrmAlertPredicates(h.platform as never, api, h.dispatcher, h.engineWatched);
    expect(h.provider.watchPredicate).not.toHaveBeenCalled();
    dispose();
  });
});
