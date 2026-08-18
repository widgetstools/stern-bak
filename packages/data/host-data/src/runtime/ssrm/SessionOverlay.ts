/**
 * Per-session query state — the layer the plane was missing.
 *
 * The plane already had a session concept for the CHEAP half of its work:
 * `configureExpressions(rules, sessionId)` and `enrich(row, sessionId)` both
 * run per session, after paging. It had none for the QUERY half — filtering,
 * sorting and the order cache are keyed on the question alone, so anything
 * that needed to change *which rows, in what order, for this window* had
 * nowhere to live.
 *
 * That single gap produced four separate roadmap findings: an SSRM edit not
 * surviving a block refetch (T2-1's tail), row exclusion excluding nothing
 * (T2-4), filtering/sorting on calculated columns (T1-4), and two windows
 * fighting over one historical snapshot. This module is the thing they were
 * all missing.
 *
 * ## The constraint that makes it safe
 *
 * A session with NO private state must keep sharing the cache exactly as it
 * does today. That is what makes the plane worth having: N windows asking the
 * same question pay for one filter pass and one sort between them. So
 * {@link SessionOverlay.stateFor} returns `null` for a clean session, its
 * cache-key contribution is the empty string, and not one row is copied.
 * Entries fork only for sessions that actually carry an overlay.
 *
 * ## Source wins
 *
 * A patch is the client's private view of a row the shared store also holds.
 * When the source re-delivers that FIELD, the source's value is the truth and
 * the patch for that field is dropped — per field, not per row, so an
 * unrelated tick on the same row does not silently discard an edit.
 */
import type { Row } from "./types.js";

/** One session's private view of the data. */
interface SessionEntry {
  /** rowKey → the fields this session has written and the source has not superseded. */
  patches: Map<string, Row>;
  /** `true` = EXCLUDE this row from the session's query. */
  exclude: ((row: Row) => boolean) | null;
  /** Bumped on every mutation; the cache key's only moving part. */
  revision: number;
}

/**
 * This session's calculated columns, materialised for a query that actually
 * reads one.
 *
 * Passed in rather than reached for, because the rules live in
 * `ExpressionRuleStore` and this module is about state a session STORES.
 * `identity` is what makes two sessions on different rules stop sharing an
 * order; `apply` returns the same reference when there is nothing to add.
 */
export interface SessionComputedView {
  readonly identity: string;
  apply(row: Row): Row;
}

/**
 * A session's overlay, resolved for one query. `null` is returned instead of
 * an "empty" instance so the hot path can branch once and then touch nothing.
 */
export interface SessionQueryState {
  /**
   * Cache-key fragment. Distinct per session AND per mutation, so an edit
   * invalidates only that session's orders.
   */
  readonly identity: string;
  /** `true` when the session excludes rows — i.e. the row SET may differ. */
  readonly narrows: boolean;
  /**
   * This session's view of a row: the stored row with its patch merged, or
   * the SAME REFERENCE when unpatched. Reference identity matters — an
   * unpatched row must not be copied, or a session with one edit would
   * duplicate the whole store.
   */
  view(row: Row): Row;
  /** `true` when the session's predicate excludes this row. */
  excluded(row: Row): boolean;
}

/** Shared empty map for a session whose only overlay is its computed view. */
const EMPTY_PATCHES: ReadonlyMap<string, Row> = new Map<string, Row>();

export class SessionOverlay {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly keyColumn: string;

  constructor(keyColumn: string) {
    this.keyColumn = keyColumn;
  }

  private entry(sessionId: string): SessionEntry {
    let e = this.sessions.get(sessionId);
    if (!e) {
      e = { patches: new Map(), exclude: null, revision: 0 };
      this.sessions.set(sessionId, e);
    }
    return e;
  }

  /** Drop an entry that has become empty, so a session that clears its state
   *  returns to the shared fast path rather than keeping a private cache key. */
  private prune(sessionId: string, e: SessionEntry): void {
    if (e.patches.size === 0 && !e.exclude) this.sessions.delete(sessionId);
  }

  /**
   * Record this session's edits. Patches MERGE — a later edit to a different
   * field of the same row does not discard the earlier one.
   */
  setPatches(sessionId: string, patches: ReadonlyArray<{ key: string; fields: Row }>): void {
    if (patches.length === 0) return;
    const e = this.entry(sessionId);
    for (const { key, fields } of patches) {
      const existing = e.patches.get(key);
      e.patches.set(key, existing ? { ...existing, ...fields } : { ...fields });
    }
    e.revision++;
  }

  /** Forget edits — all of them, or just the named rows. */
  clearPatches(sessionId: string, keys?: readonly string[]): void {
    const e = this.sessions.get(sessionId);
    if (!e) return;
    if (!keys) e.patches.clear();
    else for (const k of keys) e.patches.delete(k);
    e.revision++;
    this.prune(sessionId, e);
  }

  /** Install (or with `null`, remove) this session's row-exclusion predicate. */
  setExclude(sessionId: string, exclude: ((row: Row) => boolean) | null): void {
    const e = this.entry(sessionId);
    e.exclude = exclude;
    e.revision++;
    this.prune(sessionId, e);
  }

  /** Called on session detach. */
  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** A snapshot replaced the whole store — nothing pending survives it. */
  clearAll(): void {
    this.sessions.clear();
  }

  /** True when any session holds state — lets callers skip the tick walk. */
  get active(): boolean {
    return this.sessions.size > 0;
  }

  /**
   * Whether this session excludes rows at all.
   *
   * Asked before the overlay is built, because an exclusion rule is an
   * expression that may read a CALCULATED column, and unlike the query's own
   * column references there is nothing in the request to discover that from.
   * Treating it as a read of everything costs nothing in sharing terms — a
   * session that excludes has already forked the cache — and the alternative
   * is re-parsing the rule to see which identifiers it names.
   */
  excludes(sessionId?: string): boolean {
    if (!sessionId) return false;
    return this.sessions.get(sessionId)?.exclude != null;
  }

  /**
   * The source changed these rows, so its values win for the fields it
   * actually wrote. Per FIELD rather than per row: a tick that moves `price`
   * must not silently discard a pending edit to `notes` on the same row.
   *
   * `changedColumns` is the tick's own column set (`TickEvent.columns`), not
   * the keys of the delivered row — the store merges a partial upsert into the
   * stored row and hands listeners the FULL result, so the row's own keys
   * would claim the source rewrote every column. Without the column set the
   * safe reading is that it did, and every patch on a ticked row is dropped.
   */
  onSourceRows(
    keys: readonly string[],
    changedColumns?: readonly string[],
  ): void {
    if (this.sessions.size === 0 || keys.length === 0) return;
    const cols = changedColumns && changedColumns.length > 0 ? new Set(changedColumns) : null;
    for (const [sessionId, e] of this.sessions) {
      if (e.patches.size === 0) continue;
      let touched = false;
      for (const key of keys) {
        const patch = e.patches.get(key);
        if (!patch) continue;
        let remaining: Row | null = null;
        if (cols) {
          for (const field of Object.keys(patch)) {
            if (!cols.has(field)) (remaining ??= {})[field] = patch[field];
          }
        }
        if (remaining) e.patches.set(key, remaining);
        else e.patches.delete(key);
        touched = true;
      }
      if (touched) {
        e.revision++;
        this.prune(sessionId, e);
      }
    }
  }

  /**
   * This session's overlay, or `null` when it has none — which is the case
   * for every grid that is neither editing nor excluding nor querying one of
   * its own calculated columns, i.e. almost all of them.
   *
   * `computed` is supplied by the caller only when the query actually reads a
   * calculated field (see `QueryEngine.sessionStateFor`). A session that has
   * calculated columns but is not filtering, sorting or grouping on one gets
   * `null` here and keeps sharing the plane's cache — otherwise every grid
   * with a calculated column would fork it, which is most of them.
   */
  stateFor(
    sessionId?: string,
    computed?: SessionComputedView | null,
  ): SessionQueryState | null {
    if (!sessionId) return null;
    const e = this.sessions.get(sessionId);
    const stored = e && (e.patches.size > 0 || e.exclude !== null);
    if (!stored && !computed) return null;

    const patches = e?.patches ?? EMPTY_PATCHES;
    const exclude = e?.exclude ?? null;
    const keyColumn = this.keyColumn;
    const hasPatches = patches.size > 0;
    // Both halves, so an edit invalidates this session's orders and a rule
    // change does too. `#0` for a session that carries only computed fields.
    const identity = `${sessionId}#${e?.revision ?? 0}${computed ? `+${computed.identity}` : ''}`;

    return {
      identity,
      narrows: exclude !== null,
      view(row: Row): Row {
        let out = row;
        if (hasPatches) {
          const key = row[keyColumn];
          if (key != null) {
            const patch = patches.get(String(key));
            // The patch is merged BEFORE the calculated fields are derived, so
            // an edit to `px` moves a `[px] * [qty]` column exactly as the
            // client-side row model's valueGetter would.
            if (patch) out = { ...row, ...patch };
          }
        }
        return computed ? computed.apply(out) : out;
      },
      excluded(row: Row): boolean {
        if (!exclude) return false;
        try {
          return exclude(row) === true;
        } catch {
          // A predicate that throws excludes nothing — the same fail-open
          // rule the client-side row-exclusion filter already uses, so a
          // malformed expression never empties a grid.
          return false;
        }
      },
    };
  }
}
