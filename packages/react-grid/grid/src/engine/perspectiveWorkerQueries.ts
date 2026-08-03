/**
 * Turn the worker's push subscriptions into the shape grid modules ask
 * questions in.
 *
 * Four consumers, all of which used to answer by walking this window's own
 * row nodes: saved-filter count badges, the header painter's "does any row
 * match this rule", set-filter checkbox lists, and rule aggregates. That walk
 * is correct only while the window holds the whole book. Under Perspective it
 * holds the viewport, so the same code answers about a few hundred rows and
 * presents it as the book — silently, and confidently.
 *
 * Every one of them routes here instead, onto the Phase 5 subscription
 * protocol, where the answer is computed once in the worker for every window
 * that asked. Nothing in this module polls.
 *
 * `null` is a real answer and is passed through untouched: a filter model
 * with a clause Perspective cannot express exactly, or an expression that
 * would not compile. A caller must render nothing rather than a plausible
 * wrong number — a badge reading "matches 20,000 rows" is worse than no badge.
 */

import type {
  PerspectiveQueryAggregate,
  PerspectiveQueryResult,
  PerspectiveQuerySpec,
} from '@wellsfargo-starui/types';
import type { PerspectiveQueryClient } from '@wellsfargo-starui/grid/perspective';
import type { PerspectiveGridQueries } from './types.js';

export interface PerspectiveWorkerQueriesOpts {
  client: PerspectiveQueryClient;
  providerId: string;
  /**
   * Columns the quick search spans, so a count matches the book the user is
   * actually looking at. Read at subscribe time through a getter, because the
   * grid's own quick filter changes without this module remounting.
   */
  quickFilter?: () => { text?: string; columns?: readonly string[] } | undefined;
  /** How long a one-shot read waits before giving up. */
  onceTimeoutMs?: number;
}

/**
 * A set filter that has waited this long has an empty list on screen and a
 * user wondering why. Bounded so it reports nothing rather than nothing-yet.
 */
const DEFAULT_ONCE_TIMEOUT_MS = 10_000;

export function createPerspectiveWorkerQueries(
  opts: PerspectiveWorkerQueriesOpts,
): PerspectiveGridQueries {
  const { client, providerId, quickFilter, onceTimeoutMs = DEFAULT_ONCE_TIMEOUT_MS } = opts;

  /** Fold the live quick search into a query that counts against the book. */
  const withQuickFilter = <T extends { quickFilterText?: string; quickFilterColumns?: readonly string[] }>(
    spec: T,
  ): T => {
    const quick = quickFilter?.();
    if (!quick?.text) return spec;
    return { ...spec, quickFilterText: quick.text, quickFilterColumns: quick.columns };
  };

  /**
   * Subscribe, and translate a push into the one number the caller wants.
   * A refusal answers `null` for the same reason an inexact filter does —
   * the caller has nothing trustworthy to render either way.
   */
  const watch = <T>(
    query: PerspectiveQuerySpec,
    read: (result: PerspectiveQueryResult) => T | null,
    onValue: (value: T | null) => void,
  ): (() => void) =>
    client.subscribe(providerId, query, (result) => {
      onValue(result.kind === 'refused' ? null : read(result));
    });

  /** One answer, then unsubscribe. AG's `filterParams.values` takes a promise. */
  const once = <T>(
    query: PerspectiveQuerySpec,
    read: (result: PerspectiveQueryResult) => T | null,
  ): Promise<T | null> =>
    new Promise<T | null>((resolve) => {
      let settled = false;
      const finish = (value: T | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Deferred: `subscribe` can push synchronously, and `release` is not
        // assigned until it returns.
        queueMicrotask(() => release?.());
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), onceTimeoutMs);
      const release = client.subscribe(providerId, query, (result) => {
        finish(result.kind === 'refused' ? null : read(result));
      });
    });

  return {
    watchCount(filterModel, onCount) {
      return watch(
        withQuickFilter({ kind: 'count', filterModel } as PerspectiveQuerySpec & {
          quickFilterText?: string;
          quickFilterColumns?: readonly string[];
        }),
        (result) => (result.kind === 'count' ? result.count : null),
        onCount,
      );
    },

    watchExpressionCount(source, onCount) {
      return watch(
        { kind: 'countExpression', source },
        (result) => (result.kind === 'countExpression' ? result.count : null),
        onCount,
      );
    },

    watchAggregate(colId, aggregate: PerspectiveQueryAggregate, onValue) {
      return watch(
        withQuickFilter({ kind: 'aggregate', colId, aggregate } as PerspectiveQuerySpec & {
          quickFilterText?: string;
          quickFilterColumns?: readonly string[];
        }),
        (result) => (result.kind === 'aggregate' ? result.value : null),
        onValue,
      );
    },

    distinctValues(colId) {
      return once({ kind: 'distinctValues', colId }, (result) =>
        result.kind === 'distinctValues' ? [...result.values] : null,
      );
    },

    watchMatchSet(source, onTransition, columns) {
      return client.subscribe(
        providerId,
        { kind: 'matchSet', source, ...(columns?.length ? { columns } : {}) },
        (result) => {
          // A refusal here means the transition was past the snapshot cap —
          // thousands of rows matching at once. Reporting `null` lets the
          // caller skip a round rather than fire on a truncated prefix.
          onTransition(
            result.kind === 'matchSet'
              ? { newlyMatched: result.newlyMatched, newlyUnmatched: result.newlyUnmatched }
              : null,
          );
        },
      );
    },

    watchChangeRule(query, onHits) {
      return client.subscribe(providerId, query, (result) => {
        if (result.kind === 'changeRule') onHits(result.hits);
      });
    },
  };
}
