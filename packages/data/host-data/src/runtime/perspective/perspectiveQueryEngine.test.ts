/**
 * The worker query engine — one View per QUESTION, not per window.
 *
 * The gates here are the ones that make this worth building at all:
 *
 *   - two windows asking the same thing build ONE View
 *   - the last unsubscribe drops it; a disconnect drops it too
 *   - a count that cannot be expressed exactly answers `null`, not a number
 *   - `matchSet` pushes the diff, and refuses past the snapshot cap rather
 *     than shipping a truncated prefix
 *   - `changeRule` reads the feed's shadow, which holds only watched fields
 *
 * Fake Table and fake Views throughout: nothing here needs wasm, and a fake
 * is the only way to assert how MANY Views were built, which is the whole
 * claim.
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  PerspectiveQueryResult,
  PerspectiveQuerySpec,
  PerspectiveRowFieldChange,
} from '@wellsfargo-starui/types';
import type { PerspectiveViewConfig } from '@wellsfargo-starui/core';
import {
  createPerspectiveQueryEngine,
  queryRegistryKey,
  toQueryViewConfig,
  type PerspectiveChangeSource,
  type PerspectiveQuerySource,
} from './perspectiveQueryEngine';

// ─── Fakes ──────────────────────────────────────────────────────────

interface FakeView {
  config: PerspectiveViewConfig;
  deleted: boolean;
  rows: Record<string, unknown[]>;
  num_rows(): Promise<number>;
  to_columns(window?: { start_row?: number; end_row?: number }): Promise<Record<string, unknown[]>>;
  delete(): Promise<void>;
}

interface FakeTable {
  views: FakeView[];
  /** Views built and not yet deleted — the number the dedupe claim is about. */
  readonly liveViews: number;
  rowsFor(config: PerspectiveViewConfig): Record<string, unknown[]>;
  view(config: PerspectiveViewConfig): Promise<FakeView>;
}

function makeTable(
  rowsFor: (config: PerspectiveViewConfig) => Record<string, unknown[]> = () => ({}),
): FakeTable {
  const views: FakeView[] = [];
  return {
    views,
    get liveViews() {
      return views.filter((v) => !v.deleted).length;
    },
    rowsFor,
    async view(config: PerspectiveViewConfig) {
      const view: FakeView = {
        config,
        deleted: false,
        get rows() {
          return rowsFor(config);
        },
        async num_rows() {
          const cols = Object.values(rowsFor(config));
          return cols.length === 0 ? 0 : Math.max(...cols.map((c) => c.length));
        },
        async to_columns(window) {
          const all = rowsFor(config);
          const start = window?.start_row ?? 0;
          const end = window?.end_row ?? Number.MAX_SAFE_INTEGER;
          const out: Record<string, unknown[]> = {};
          for (const [name, values] of Object.entries(all)) out[name] = values.slice(start, end);
          return out;
        },
        async delete() {
          view.deleted = true;
        },
      };
      views.push(view);
      return view;
    },
  };
}

function makeSource(
  table: FakeTable,
  over: Partial<PerspectiveQuerySource> = {},
): PerspectiveQuerySource & { fireUpdate(): void; updateListeners: number } {
  const listeners = new Set<() => void>();
  return {
    tableName: 'positions',
    keyColumn: 'id',
    table: table as unknown as PerspectiveQuerySource['table'],
    onUpdate(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    fireUpdate() {
      for (const cb of [...listeners]) cb();
    },
    get updateListeners() {
      return listeners.size;
    },
    ...over,
  };
}

/** Runs scheduled work immediately, so a test never waits on a throttle. */
const immediateTimers = {
  setTimer: (cb: () => void) => {
    cb();
    return 0;
  },
  clearTimer: () => {},
};

function collect() {
  const results: PerspectiveQueryResult[] = [];
  return { results, onResult: (r: PerspectiveQueryResult) => results.push(r) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// ─── Pure translation ───────────────────────────────────────────────

describe('toQueryViewConfig', () => {
  it('translates a count through the same path the window uses', () => {
    const config = toQueryViewConfig(
      { kind: 'count', filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'FX' } } },
      'id',
    );
    expect(config).toEqual({ filter: [['desk', '==', 'FX']] });
  });

  it('rides an expression query as a boolean column plus its clause', () => {
    const config = toQueryViewConfig({ kind: 'countExpression', source: '"pnl" > 100' }, 'id');
    expect(config).toEqual({
      expressions: { __match__: '"pnl" > 100' },
      filter: [['__match__', '==', true]],
    });
  });

  it('gives an aggregate one synthetic group so row 0 is the whole-book total', () => {
    const config = toQueryViewConfig({ kind: 'aggregate', colId: 'pnl', aggregate: 'sum' }, 'id');
    expect(config?.group_by).toEqual(['__total__']);
    expect(config?.aggregates).toEqual({ pnl: 'sum' });
  });

  it('carries the key column in a matchSet snapshot even when none were asked for', () => {
    const config = toQueryViewConfig({ kind: 'matchSet', source: 'true' }, 'positionId');
    expect(config?.columns).toEqual(['positionId']);
  });

  it('needs no View for a changeRule', () => {
    expect(
      toQueryViewConfig({ kind: 'changeRule', ruleId: 'r', field: 'px', mode: 'relativeChange' }, 'id'),
    ).toBeNull();
  });
});

describe('queryRegistryKey', () => {
  it('collides for filter models that TRANSLATE the same', () => {
    const a: PerspectiveQuerySpec = {
      kind: 'count',
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'FX' } },
    };
    // Same clause, arrived at with the extra keys AG sometimes carries.
    const b: PerspectiveQuerySpec = {
      kind: 'count',
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'FX', filterTo: undefined } },
    };
    expect(queryRegistryKey('positions', a, 'id')).toBe(queryRegistryKey('positions', b, 'id'));
  });

  it('separates the same question over different tables', () => {
    const q: PerspectiveQuerySpec = { kind: 'count' };
    expect(queryRegistryKey('positions', q, 'id')).not.toBe(queryRegistryKey('trades', q, 'id'));
  });

  it('separates two change rules with identical parameters but different ids', () => {
    const base = { kind: 'changeRule', field: 'px', mode: 'relativeChange' } as const;
    expect(queryRegistryKey('t', { ...base, ruleId: 'a' }, 'id')).not.toBe(
      queryRegistryKey('t', { ...base, ruleId: 'b' }, 'id'),
    );
  });
});

// ─── Dedupe + lifecycle ─────────────────────────────────────────────

describe('dedupe across windows', () => {
  it('builds ONE View for two windows asking the same question', async () => {
    const table = makeTable(() => ({ id: ['a', 'b', 'c'] }));
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const windowA = collect();
    const windowB = collect();

    const query: PerspectiveQuerySpec = { kind: 'count' };
    engine.subscribe({ subId: 's1', owner: {}, source, query, onResult: windowA.onResult });
    engine.subscribe({ subId: 's2', owner: {}, source, query, onResult: windowB.onResult });
    await flush();

    expect(table.liveViews).toBe(1);
    expect(engine.entryCount).toBe(1);
    expect(engine.subscriberCount).toBe(2);
    expect(windowA.results).toContainEqual({ kind: 'count', count: 3 });
    // The second window gets the standing answer at once rather than
    // waiting out a throttle window for a question already answered.
    expect(windowB.results).toContainEqual({ kind: 'count', count: 3 });
  });

  it('builds separate Views for different questions', async () => {
    const table = makeTable(() => ({ id: ['a'] }));
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: { kind: 'count' },
      onResult: () => {},
    });
    engine.subscribe({
      subId: 's2', owner: {}, source,
      query: { kind: 'count', filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'FX' } } },
      onResult: () => {},
    });
    await flush();

    expect(engine.entryCount).toBe(2);
    expect(table.liveViews).toBe(2);
  });

  it('recomputes once per update for N windows', async () => {
    const rowsFor = vi.fn(() => ({ id: ['a', 'b'] }));
    const table = makeTable(rowsFor);
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const query: PerspectiveQuerySpec = { kind: 'count' };

    for (const subId of ['s1', 's2', 's3']) {
      engine.subscribe({ subId, owner: {}, source, query, onResult: () => {} });
    }
    await flush();
    // One entry means one update listener, so a tick cannot fan into N scans.
    expect(source.updateListeners).toBe(1);
  });
});

describe('teardown', () => {
  it('drops the View on the LAST unsubscribe, not the first', async () => {
    const table = makeTable(() => ({ id: ['a'] }));
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const query: PerspectiveQuerySpec = { kind: 'count' };

    engine.subscribe({ subId: 's1', owner: {}, source, query, onResult: () => {} });
    engine.subscribe({ subId: 's2', owner: {}, source, query, onResult: () => {} });
    await flush();

    engine.unsubscribe('s1');
    await flush();
    expect(table.liveViews).toBe(1);
    expect(engine.entryCount).toBe(1);

    engine.unsubscribe('s2');
    await flush();
    expect(table.liveViews).toBe(0);
    expect(engine.entryCount).toBe(0);
    expect(source.updateListeners).toBe(0);
  });

  it('leaks neither View nor subscription when a window disconnects mid-flight', async () => {
    let releaseRead!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const table = makeTable(() => ({ id: ['a', 'b'] }));
    const slowView = table.view.bind(table);
    table.view = async (config) => {
      const view = await slowView(config);
      const inner = view.num_rows.bind(view);
      view.num_rows = async () => {
        await gate;
        return inner();
      };
      return view;
    };
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const owner = {};

    engine.subscribe({
      subId: 's1', owner, source, query: { kind: 'count' }, onResult: () => {},
    });
    // The window goes away while the first read is still in the engine.
    engine.releaseOwner(owner);
    releaseRead();
    await flush();
    await flush();

    expect(engine.entryCount).toBe(0);
    expect(engine.subscriberCount).toBe(0);
    // `createSafeView` drains the in-flight read before deleting — the
    // View is gone, and it was never deleted out from under the read.
    expect(table.liveViews).toBe(0);
  });

  it('stop() closes every View', async () => {
    const table = makeTable(() => ({ id: ['a'] }));
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);

    engine.subscribe({ subId: 's1', owner: {}, source, query: { kind: 'count' }, onResult: () => {} });
    engine.subscribe({
      subId: 's2', owner: {}, source,
      query: { kind: 'countExpression', source: 'true' },
      onResult: () => {},
    });
    await flush();
    expect(table.liveViews).toBe(2);

    await engine.stop();
    expect(table.liveViews).toBe(0);
    expect(engine.entryCount).toBe(0);
  });
});

// ─── The six query kinds ────────────────────────────────────────────

describe('count', () => {
  it('answers the matching row count', async () => {
    const table = makeTable(() => ({ id: ['a', 'b', 'c', 'd'] }));
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: { kind: 'count' }, onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({ kind: 'count', count: 4 });
  });

  it('answers NULL — never a number — for a filter it cannot express exactly', async () => {
    const table = makeTable(() => ({ id: ['a', 'b', 'c'] }));
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: {
        kind: 'count',
        // An OR compound: Perspective clause lists are conjunctive, so this
        // has no exact translation and `toPerspectiveFilterClauses` drops it.
        filterModel: {
          desk: {
            filterType: 'text',
            operator: 'OR',
            conditions: [
              { filterType: 'text', type: 'equals', filter: 'FX' },
              { filterType: 'text', type: 'equals', filter: 'RATES' },
            ],
          },
        },
      },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({ kind: 'count', count: null });
    // And it never built a View to be wrong with.
    expect(table.liveViews).toBe(0);
  });

  it('pushes a fresh answer when the Table changes', async () => {
    let ids = ['a', 'b'];
    const table = makeTable(() => ({ id: ids }));
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source, query: { kind: 'count' }, onResult: sink.onResult,
    });
    await flush();
    expect(sink.results.at(-1)).toEqual({ kind: 'count', count: 2 });

    ids = ['a', 'b', 'c'];
    source.fireUpdate();
    await flush();

    expect(sink.results.at(-1)).toEqual({ kind: 'count', count: 3 });
  });
});

describe('countExpression', () => {
  it('counts the rows a compiled rule selects', async () => {
    const table = makeTable((config) =>
      config.expressions?.__match__ === '"pnl" > 100' ? { id: ['a', 'b'] } : { id: [] },
    );
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: { kind: 'countExpression', source: '"pnl" > 100' },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({ kind: 'countExpression', count: 2 });
  });

  it('refuses with the engine reason when the expression will not build', async () => {
    const table = makeTable();
    table.view = async () => {
      throw new Error('Unknown function `nope`');
    };
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: { kind: 'countExpression', source: 'nope()' },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({
      kind: 'refused',
      reason: 'Unknown function `nope`',
    });
  });
});

describe('aggregate', () => {
  it('reads the total off row 0 of the synthetic group', async () => {
    const table = makeTable(() => ({ __ROW_PATH__: [[]], pnl: [4_200] }));
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: { kind: 'aggregate', colId: 'pnl', aggregate: 'sum' },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({ kind: 'aggregate', value: 4_200 });
  });

  it('answers null rather than a number for an inexpressible filter', async () => {
    const table = makeTable(() => ({ pnl: [4_200] }));
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: {
        kind: 'aggregate',
        colId: 'pnl',
        aggregate: 'sum',
        filterModel: { desk: { filterType: 'text', type: 'startsWith', filter: 'F' } },
      },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({ kind: 'aggregate', value: null });
  });
});

describe('distinctValues', () => {
  it('returns the group keys, skipping the grand-total row', async () => {
    const table = makeTable(() => ({
      __ROW_PATH__: [[], ['FX'], ['RATES'], ['CREDIT']],
      desk: [null, 'FX', 'RATES', 'CREDIT'],
    }));
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: { kind: 'distinctValues', colId: 'desk' },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({
      kind: 'distinctValues',
      values: ['FX', 'RATES', 'CREDIT'],
    });
  });

  it('REFUSES past the ceiling rather than truncating the list', async () => {
    const paths: unknown[][] = [[]];
    for (let i = 0; i < 12; i++) paths.push([`v${i}`]);
    const table = makeTable(() => ({ __ROW_PATH__: paths }));
    const engine = createPerspectiveQueryEngine({ ...immediateTimers, distinctValuesLimit: 5 });
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      query: { kind: 'distinctValues', colId: 'desk' },
      onResult: sink.onResult,
    });
    await flush();

    const result = sink.results.at(-1)!;
    expect(result.kind).toBe('refused');
    expect((result as { reason: string }).reason).toContain('12 distinct values');
    expect((result as { reason: string }).reason).toContain('truncated');
  });

  it('clamps a caller limit to the engine ceiling', async () => {
    const paths: unknown[][] = [[]];
    for (let i = 0; i < 8; i++) paths.push([`v${i}`]);
    const table = makeTable(() => ({ __ROW_PATH__: paths }));
    const engine = createPerspectiveQueryEngine({ ...immediateTimers, distinctValuesLimit: 5 });
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source: makeSource(table),
      // Asking for more than the engine allows does not raise the ceiling.
      query: { kind: 'distinctValues', colId: 'desk', limit: 1_000 },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)!.kind).toBe('refused');
  });
});

describe('matchSet', () => {
  it('pushes the whole set first, then only the diff', async () => {
    let matching = { id: ['a', 'b'], pnl: [10, 20] };
    const table = makeTable(() => matching);
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: { kind: 'matchSet', source: '"pnl" > 5', columns: ['pnl'] },
      onResult: sink.onResult,
    });
    await flush();

    expect(sink.results.at(-1)).toEqual({
      kind: 'matchSet',
      newlyMatched: [
        { id: 'a', data: { pnl: 10 } },
        { id: 'b', data: { pnl: 20 } },
      ],
      newlyUnmatched: [],
    });

    // `a` drops out, `c` enters. Only the transition crosses the wire —
    // `b` stayed matched and is not re-sent.
    matching = { id: ['b', 'c'], pnl: [20, 30] };
    source.fireUpdate();
    await flush();

    expect(sink.results.at(-1)).toEqual({
      kind: 'matchSet',
      newlyMatched: [{ id: 'c', data: { pnl: 30 } }],
      newlyUnmatched: ['a'],
    });
  });

  it('gives a window joining a live rule the whole set, and its peer the diff', async () => {
    let matching = { id: ['a'], pnl: [10] };
    const table = makeTable(() => matching);
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const first = collect();
    const second = collect();
    const query: PerspectiveQuerySpec = { kind: 'matchSet', source: '"pnl" > 5', columns: ['pnl'] };

    engine.subscribe({ subId: 's1', owner: {}, source, query, onResult: first.onResult });
    await flush();
    matching = { id: ['a', 'b'], pnl: [10, 20] };

    engine.subscribe({ subId: 's2', owner: {}, source, query, onResult: second.onResult });
    await flush();

    // Still one View, because it is still one question.
    expect(table.liveViews).toBe(1);
    // The joiner has seen nothing before now, so `a` is new to IT.
    expect(second.results.at(-1)).toMatchObject({
      newlyMatched: [{ id: 'a' }, { id: 'b' }],
      newlyUnmatched: [],
    });
    // Its peer only learns about `b`.
    expect(first.results.at(-1)).toMatchObject({
      newlyMatched: [{ id: 'b' }],
      newlyUnmatched: [],
    });
  });

  it('REFUSES a transition past the snapshot cap, then recovers on the next one', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `r${i}`);
    let matching: Record<string, unknown[]> = { id: ids };
    const table = makeTable(() => matching);
    const source = makeSource(table);
    const engine = createPerspectiveQueryEngine({ ...immediateTimers, matchSetSnapshotCap: 200 });
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: { kind: 'matchSet', source: 'true' },
      onResult: sink.onResult,
    });
    await flush();

    const refusal = sink.results.at(-1)!;
    expect(refusal.kind).toBe('refused');
    expect((refusal as { reason: string }).reason).toContain('300 rows newly matched');
    expect((refusal as { reason: string }).reason).toContain('truncated');

    // The matched set advanced anyway, so the next transition is small and
    // normal service resumes without the caller doing anything.
    matching = { id: [...ids, 'extra'] };
    source.fireUpdate();
    await flush();

    expect(sink.results.at(-1)).toEqual({
      kind: 'matchSet',
      newlyMatched: [{ id: 'extra', data: {} }],
      newlyUnmatched: [],
    });
  });
});

// ─── changeRule ─────────────────────────────────────────────────────

function makeChangeSource(): PerspectiveChangeSource & {
  emit(changes: PerspectiveRowFieldChange[]): void;
  watched: string[];
} {
  const listeners = new Set<(c: readonly PerspectiveRowFieldChange[]) => void>();
  const watched: string[] = [];
  return {
    watched,
    watch(fields) {
      watched.push(...fields);
      return () => {
        for (const f of fields) {
          const i = watched.indexOf(f);
          if (i >= 0) watched.splice(i, 1);
        }
      };
    },
    onChanges(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit(changes) {
      for (const cb of [...listeners]) cb(changes);
    },
  };
}

const change = (over: Partial<PerspectiveRowFieldChange> = {}): PerspectiveRowFieldChange => ({
  key: 'p1',
  field: 'price',
  oldValue: 100,
  newValue: 110,
  row: { id: 'p1', price: 110 },
  ...over,
});

describe('changeRule', () => {
  it('fires a relativeChange hit through core\'s own evaluator', async () => {
    const changes = makeChangeSource();
    const source = makeSource(makeTable(), { changes });
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: {
        kind: 'changeRule',
        ruleId: 'rule-1',
        field: 'price',
        mode: 'relativeChange',
        changeMode: 'PERCENT_CHANGE',
        threshold: 5,
      },
      onResult: sink.onResult,
    });

    // 100 -> 110 is 10%, over the 5% threshold.
    changes.emit([change()]);
    expect(sink.results.at(-1)).toEqual({
      kind: 'changeRule',
      hits: [{ ruleId: 'rule-1', rowId: 'p1', column: 'price', value: 110, prevValue: 100 }],
    });

    // 100 -> 102 is 2%, under it. Nothing is pushed at all.
    const before = sink.results.length;
    changes.emit([change({ oldValue: 100, newValue: 102 })]);
    expect(sink.results).toHaveLength(before);
  });

  it('watches ONLY the field the rule names', () => {
    const changes = makeChangeSource();
    const source = makeSource(makeTable(), { changes });
    const engine = createPerspectiveQueryEngine(immediateTimers);

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: { kind: 'changeRule', ruleId: 'r', field: 'price', mode: 'relativeChange' },
      onResult: () => {},
    });

    expect(changes.watched).toEqual(['price']);
  });

  it('ignores changes to fields the rule does not name', () => {
    const changes = makeChangeSource();
    const source = makeSource(makeTable(), { changes });
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: { kind: 'changeRule', ruleId: 'r', field: 'price', mode: 'relativeChange' },
      onResult: sink.onResult,
    });

    changes.emit([change({ field: 'quantity' })]);
    expect(sink.results).toHaveLength(0);
  });

  it('releases its field watch on unsubscribe', () => {
    const changes = makeChangeSource();
    const source = makeSource(makeTable(), { changes });
    const engine = createPerspectiveQueryEngine(immediateTimers);

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: { kind: 'changeRule', ruleId: 'r', field: 'price', mode: 'relativeChange' },
      onResult: () => {},
    });
    expect(changes.watched).toEqual(['price']);

    engine.unsubscribe('s1');
    expect(changes.watched).toEqual([]);
  });

  it('evaluates a dataChange rule with the injected expression engine', () => {
    const changes = makeChangeSource();
    const source = makeSource(makeTable(), { changes });
    const engine = createPerspectiveQueryEngine({
      ...immediateTimers,
      expressionEngine: {
        parseAndEvaluate: (src, ctx) => {
          expect(src).toBe('x > 105');
          return (ctx as { x: number }).x > 105;
        },
      } as never,
    });
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: {
        kind: 'changeRule',
        ruleId: 'rule-2',
        field: 'price',
        mode: 'dataChange',
        expression: 'x > 105',
      },
      onResult: sink.onResult,
    });

    changes.emit([change()]);
    expect(sink.results.at(-1)).toMatchObject({
      kind: 'changeRule',
      hits: [{ ruleId: 'rule-2', rowId: 'p1', column: 'price', value: 110 }],
    });
  });

  it('refuses a dataChange rule when the worker carries no expression engine', () => {
    const changes = makeChangeSource();
    const source = makeSource(makeTable(), { changes });
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: {
        kind: 'changeRule', ruleId: 'r', field: 'price', mode: 'dataChange', expression: 'true',
      },
      onResult: sink.onResult,
    });

    expect(sink.results.at(-1)).toEqual({
      kind: 'refused',
      reason: expect.stringContaining('without an expression engine'),
    });
    expect(engine.entryCount).toBe(0);
  });

  it('refuses when the provider exposes no field-change feed', () => {
    const source = makeSource(makeTable());
    const engine = createPerspectiveQueryEngine(immediateTimers);
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source,
      query: { kind: 'changeRule', ruleId: 'r', field: 'price', mode: 'relativeChange' },
      onResult: sink.onResult,
    });

    expect(sink.results.at(-1)).toEqual({
      kind: 'refused',
      reason: expect.stringContaining('no field-change feed'),
    });
  });
});

// ─── Throttle ───────────────────────────────────────────────────────

describe('throttle', () => {
  it('collapses a burst of updates into one recompute', async () => {
    const pending: (() => void)[] = [];
    const table = makeTable(() => ({ id: ['a'] }));
    const source = makeSource(table);
    const reads = vi.spyOn(table, 'view');
    const engine = createPerspectiveQueryEngine({
      setTimer: (cb) => {
        pending.push(cb);
        return pending.length;
      },
      clearTimer: () => {},
    });
    const sink = collect();

    engine.subscribe({
      subId: 's1', owner: {}, source, query: { kind: 'count' }, onResult: sink.onResult,
    });
    await flush();
    const initial = sink.results.length;

    // Ten ticks land before the throttle window elapses.
    for (let i = 0; i < 10; i++) source.fireUpdate();
    expect(pending).toHaveLength(1);

    pending.shift()!();
    await flush();

    expect(sink.results.length).toBe(initial + 1);
    // Still the one View — a recompute re-reads it, it does not rebuild.
    expect(reads).toHaveBeenCalledTimes(1);
  });
});
