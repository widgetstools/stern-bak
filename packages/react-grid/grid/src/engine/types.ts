/**
 * Types shared by the row-engine layer.
 *
 * `stern-bak` has exactly TWO row engines and never had a third: the
 * client-side model, where every window materializes the whole book, and
 * Perspective, where the book lives once in a SharedWorker and each window
 * reads only the blocks its viewport asks for. There is no hand-rolled
 * server tier here and no `'server'` branch to keep alive.
 */

import type { PerspectiveRowEngine } from '@wellsfargo-starui/grid/perspective';
import type {
  PerspectiveAlertHit,
  PerspectiveChangeRuleQuery,
  PerspectiveQueryAggregate,
  PerspectiveRowSnapshot,
} from '@wellsfargo-starui/types';

/** Which engine supplies a grid's rows. */
export type MarketsGridRowModel = 'client' | 'perspective';

/**
 * Which surface the host mounts. `'pending'` mounts NO grid at all — see
 * `resolveGridSurface` for why that is a state rather than a fallback.
 */
export type GridSurfaceChoice = 'client' | 'perspective' | 'pending';

/**
 * A stable handle to a swappable Perspective row engine.
 *
 * AG Grid reads the `context` grid option when it CREATES the grid and hands
 * that exact value to every status panel it instantiates. The engine is not
 * stable: it is rebuilt whenever the Table changes — a provider restart hands
 * over a new one, and React StrictMode double-invokes the mount effect. So
 * the context carries this holder instead. Its identity never changes; what
 * it points at does, and subscribers are told.
 */
export interface PerspectiveEngineHolder {
  get(): PerspectiveRowEngine | null;
  set(engine: PerspectiveRowEngine | null): void;
  /**
   * Called with the current engine immediately, then on every swap. The
   * immediate call is not a convenience: a subscriber that arrives after the
   * swap it cared about would otherwise wait forever for a second one.
   * Returns an unsubscribe.
   */
  subscribe(listener: (engine: PerspectiveRowEngine | null) => void): () => void;
}

/**
 * Whole-book questions, answered in the worker and PUSHED back.
 *
 * Every one of these used to be answered by walking the grid's own row
 * nodes, which is correct only while this window holds the whole book. Under
 * Perspective it holds the viewport, so the same walk silently answers about
 * a few hundred rows and calls it the book. These route to the worker
 * instead, where the answer is computed once for every window that asked.
 *
 * `null` in a callback means "cannot be answered exactly" — a filter model
 * with a clause Perspective cannot express, or an expression that would not
 * compile. Callers must render nothing rather than a plausible wrong number.
 */
export interface PerspectiveGridQueries {
  /** Rows matching a filter model, live. Returns an unsubscribe. */
  watchCount(
    filterModel: Record<string, unknown>,
    onCount: (count: number | null) => void,
  ): () => void;
  /**
   * Rows matching a compiled Perspective boolean expression, live. This is
   * how a style rule learns whether ANY row in the book matches it.
   */
  watchExpressionCount(
    source: string,
    onCount: (count: number | null) => void,
  ): () => void;
  /** One column aggregate over the whole book, live. */
  watchAggregate(
    colId: string,
    aggregate: PerspectiveQueryAggregate,
    onValue: (value: number | null) => void,
  ): () => void;
  /**
   * Distinct values of a column — the set filter's checkbox list.
   *
   * One-shot, because that is the shape AG's `filterParams.values` callback
   * takes. Resolves null when the worker refused (past the value ceiling),
   * so the caller shows no list rather than a truncated one presented as
   * complete.
   */
  distinctValues(colId: string): Promise<unknown[] | null>;

  /**
   * Rows entering and leaving the set matched by a compiled expression.
   *
   * A TRANSITION, not a membership: the interesting event for an alert is a
   * row crossing a threshold, not the set of rows already over it. The first
   * push carries the whole current set, because a subscriber has seen none
   * of it yet.
   */
  watchMatchSet(
    source: string,
    onTransition: (
      transition: {
        newlyMatched: readonly PerspectiveRowSnapshot[];
        newlyUnmatched: readonly string[];
      } | null,
    ) => void,
    columns?: readonly string[],
  ): () => void;

  /**
   * A field CHANGING in a way a rule cares about — the one question no View
   * can answer, since an upsert Table does not retain the previous value.
   * Served by the table feed's shadow map in the worker.
   */
  watchChangeRule(
    query: PerspectiveChangeRuleQuery,
    onHits: (hits: readonly PerspectiveAlertHit[]) => void,
  ): () => void;
}

/**
 * What the Perspective surface puts on the grid `context`.
 *
 * Read by the status panel, the saved-filter badges and the header painter —
 * all of which are mounted by the module pipeline and have no other way to
 * reach the engine.
 */
export interface PerspectiveGridContext {
  perspectiveEngineHolder: PerspectiveEngineHolder;
  /** Null when this grid has no worker query client wired. */
  perspectiveQueries: PerspectiveGridQueries | null;
  /** True once an engine is attached and the answers can be believed. */
  readonly perspectiveConfigured: boolean;
}

/** Narrow an AG Grid `context` to the Perspective contract, or null. */
export function asPerspectiveContext(context: unknown): PerspectiveGridContext | null {
  if (!context || typeof context !== 'object') return null;
  const candidate = context as Partial<PerspectiveGridContext>;
  return candidate.perspectiveEngineHolder ? (candidate as PerspectiveGridContext) : null;
}

/**
 * Read the Perspective context off a grid api, or null on any grid that has
 * none.
 *
 * `getGridOption` is feature-detected rather than called: the api can be
 * mid-teardown, and much of this package is unit-tested against minimal api
 * doubles that implement only the methods a given test exercises. A module
 * that reaches for the context must not be the reason one of those throws.
 */
export function readPerspectiveContext(api: unknown): PerspectiveGridContext | null {
  const getGridOption = (api as { getGridOption?(key: string): unknown } | null | undefined)
    ?.getGridOption;
  if (typeof getGridOption !== 'function') return null;
  try {
    return asPerspectiveContext(getGridOption.call(api, 'context'));
  } catch {
    return null;
  }
}
