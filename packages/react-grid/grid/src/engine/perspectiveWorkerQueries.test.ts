/**
 * The bridge between grid modules and the worker's push protocol.
 *
 * The property that matters everywhere: a `null` answer and a `refused` push
 * both surface as `null`, never as a number. Each of these questions used to
 * be answered by walking this window's own rows, which under Perspective
 * means the viewport — so a wrong number here is not obviously wrong, and a
 * caller shown one has no way to know.
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  PerspectiveQueryResult,
  PerspectiveQuerySpec,
} from '@wellsfargo-starui/types';
import type { PerspectiveQueryClient } from '@wellsfargo-starui/grid/perspective';
import { createPerspectiveWorkerQueries } from './perspectiveWorkerQueries';

interface FakeSub {
  query: PerspectiveQuerySpec;
  push(result: PerspectiveQueryResult): void;
  released: boolean;
}

function fakeClient() {
  const subs: FakeSub[] = [];
  const client = {
    subscribe(_providerId: string, query: PerspectiveQuerySpec, onResult) {
      const sub: FakeSub = { query, push: onResult, released: false };
      subs.push(sub);
      return () => {
        sub.released = true;
      };
    },
    openSubscriptions: 0,
    close: () => {},
  } as unknown as PerspectiveQueryClient;
  return { client, subs };
}

const build = (over: Parameters<typeof createPerspectiveWorkerQueries>[0] extends infer T
  ? Partial<T>
  : never = {}) => {
  const { client, subs } = fakeClient();
  return {
    subs,
    queries: createPerspectiveWorkerQueries({ client, providerId: 'p1', ...over }),
  };
};

describe('watchCount', () => {
  it('pushes the count through', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchCount({ desk: { filterType: 'text' } }, seen);
    subs[0].push({ kind: 'count', count: 42 });

    expect(subs[0].query).toMatchObject({ kind: 'count' });
    expect(seen).toHaveBeenCalledWith(42);
  });

  it('passes a null count through as null — never as a number', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchCount({}, seen);
    subs[0].push({ kind: 'count', count: null });

    expect(seen).toHaveBeenCalledWith(null);
  });

  it('reports a refusal as null', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchCount({}, seen);
    subs[0].push({ kind: 'refused', reason: 'no engine' });

    expect(seen).toHaveBeenCalledWith(null);
  });

  it('folds the live quick search into the query', () => {
    const { queries, subs } = build({
      quickFilter: () => ({ text: 'acme', columns: ['desk', 'book'] }),
    });

    queries.watchCount({}, vi.fn());

    expect(subs[0].query).toMatchObject({
      quickFilterText: 'acme',
      quickFilterColumns: ['desk', 'book'],
    });
  });

  it('omits the quick search when there is none', () => {
    const { queries, subs } = build({ quickFilter: () => ({ text: '' }) });

    queries.watchCount({}, vi.fn());

    expect(subs[0].query).not.toHaveProperty('quickFilterText');
  });

  it('releases the worker subscription on unsubscribe', () => {
    const { queries, subs } = build();
    queries.watchCount({}, vi.fn())();
    expect(subs[0].released).toBe(true);
  });
});

describe('watchExpressionCount and watchAggregate', () => {
  it('counts an expression', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchExpressionCount('"pnl" > 100', seen);
    subs[0].push({ kind: 'countExpression', count: 7 });

    expect(subs[0].query).toMatchObject({ kind: 'countExpression', source: '"pnl" > 100' });
    expect(seen).toHaveBeenCalledWith(7);
  });

  it('reads one aggregate', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchAggregate('pnl', 'sum', seen);
    subs[0].push({ kind: 'aggregate', value: 4200 });

    expect(seen).toHaveBeenCalledWith(4200);
  });
});

describe('distinctValues', () => {
  it('resolves the first answer and then unsubscribes', async () => {
    const { queries, subs } = build();

    const pending = queries.distinctValues('desk');
    subs[0].push({ kind: 'distinctValues', values: ['FX', 'RATES'] });

    await expect(pending).resolves.toEqual(['FX', 'RATES']);
    // One answer is all AG's `filterParams.values` callback wants; holding the
    // subscription open would keep a View alive in the worker for nobody.
    await new Promise((r) => setTimeout(r, 0));
    expect(subs[0].released).toBe(true);
  });

  it('resolves null when the worker refuses, so no list is shown at all', async () => {
    const { queries, subs } = build();

    const pending = queries.distinctValues('desk');
    subs[0].push({ kind: 'refused', reason: 'past the 500-value ceiling' });

    // Not an empty array presented as the column's values — null, which the
    // caller renders as "no list" rather than "no values".
    await expect(pending).resolves.toBeNull();
  });

  it('resolves null rather than hanging when nothing answers', async () => {
    const { queries } = build({ onceTimeoutMs: 5 });
    await expect(queries.distinctValues('desk')).resolves.toBeNull();
  });
});

describe('watchMatchSet and watchChangeRule', () => {
  it('forwards a transition', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchMatchSet('"pnl" > 100', seen, ['pnl']);
    subs[0].push({
      kind: 'matchSet',
      newlyMatched: [{ id: 'r1', data: { pnl: 150 } }],
      newlyUnmatched: ['r0'],
    });

    expect(subs[0].query).toMatchObject({ kind: 'matchSet', columns: ['pnl'] });
    expect(seen).toHaveBeenCalledWith({
      newlyMatched: [{ id: 'r1', data: { pnl: 150 } }],
      newlyUnmatched: ['r0'],
    });
  });

  it('reports a capped transition as null so no truncated prefix fires', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchMatchSet('true', seen);
    subs[0].push({ kind: 'refused', reason: '4213 rows newly matched at once' });

    expect(seen).toHaveBeenCalledWith(null);
  });

  it('forwards change-rule hits', () => {
    const { queries, subs } = build();
    const seen = vi.fn();

    queries.watchChangeRule(
      { kind: 'changeRule', ruleId: 'r1', field: 'price', mode: 'relativeChange' },
      seen,
    );
    const hits = [{ ruleId: 'r1', rowId: 'p1', column: 'price', value: 110, prevValue: 100 }];
    subs[0].push({ kind: 'changeRule', hits });

    expect(seen).toHaveBeenCalledWith(hits);
  });
});
