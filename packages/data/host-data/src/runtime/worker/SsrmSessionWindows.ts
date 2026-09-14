/**
 * Which rows each SSRM session has loaded — the keys of every block its grid
 * has read — so the tick loop can trim a provider's row delta per session
 * to the rows that grid actually holds.
 *
 * Why: the engine's shared row delta is the WHOLE table's churn (every
 * upserted row, full width), and the hub used to post that identical payload
 * to every session of the provider. Twelve grids each holding two or three
 * blocks of a fast feed were deserializing ~4.5 MB/s apiece on their main
 * threads — for rows they would immediately discard as "not loaded". A
 * trimmed tick carries only the loaded rows plus a count of the rest, which
 * is all `bindSsrmTicks` needs for its count check / positional refresh.
 *
 * Correctness rule: never withhold a row the grid might hold. A session is
 * trimmed only after it has read at least one FLAT block (proof it is a
 * block-reading grid); a grouped read switches it back to full ticks (group
 * rows have no leaf keys); and when the key set outgrows `maxKeys` the
 * session stays on full ticks for good rather than guess which blocks the
 * grid evicted. Stale keys (blocks the grid purged) only cost bytes.
 */

import type { SsrmGetRowsRequest, SsrmTickPayload } from '../ssrm/ssrmTypes.js';

interface SessionWindow {
  keys: Set<string>;
  /** Last block read was grouped → full ticks until a flat read. */
  grouped: boolean;
  /** Key set overflowed → full ticks for the rest of the session. */
  overflow: boolean;
}

export const DEFAULT_MAX_SESSION_KEYS = 50_000;

export class SsrmSessionWindows {
  private readonly sessions = new Map<string, SessionWindow>();

  constructor(private readonly maxKeys = DEFAULT_MAX_SESSION_KEYS) {}

  /** A block read landed for `subId`: remember its leaf keys. */
  noteBlock(subId: string, request: SsrmGetRowsRequest, keys: readonly (string | null)[]): void {
    let s = this.sessions.get(subId);
    if (!s) {
      s = { keys: new Set(), grouped: false, overflow: false };
      this.sessions.set(subId, s);
    }
    if (s.overflow) return;
    const grouped = (request.rowGroupCols?.length ?? 0) > 0 || (request.groupKeys?.length ?? 0) > 0;
    s.grouped = grouped;
    if (grouped) return;
    for (const k of keys) {
      if (k !== null) s.keys.add(k);
    }
    if (s.keys.size > this.maxKeys) {
      s.overflow = true;
      s.keys.clear();
    }
  }

  drop(subId: string): void {
    this.sessions.delete(subId);
  }

  /** True when this session gets trimmed ticks. */
  isTrimmed(subId: string): boolean {
    const s = this.sessions.get(subId);
    return Boolean(s && !s.grouped && !s.overflow);
  }

  /**
   * The tick this session should receive: the payload itself when the
   * session is not trimmed (or the tick is not a row delta), a trimmed copy
   * with `unloaded` counts otherwise, or `null` when there is nothing at
   * all to tell it.
   */
  trim(
    subId: string,
    tick: SsrmTickPayload,
    upsertKeys: readonly (string | null)[],
  ): SsrmTickPayload | null {
    const s = this.sessions.get(subId);
    if (!s || s.grouped || s.overflow || tick.kind !== 'rowDelta' || tick.reset) return tick;
    const allUpserts = tick.upserts ?? [];
    const allRemovals = tick.removals ?? [];
    const upserts: Record<string, unknown>[] = [];
    for (let i = 0; i < allUpserts.length; i++) {
      const k = upsertKeys[i];
      if (k !== null && k !== undefined && s.keys.has(k)) upserts.push(allUpserts[i]);
    }
    const removals: string[] = [];
    for (const id of allRemovals) {
      if (s.keys.delete(id)) removals.push(id);
    }
    const unloaded = { upserts: allUpserts.length - upserts.length, removals: allRemovals.length - removals.length };
    if (upserts.length === 0 && removals.length === 0 && unloaded.upserts === 0 && unloaded.removals === 0) return null;
    return { kind: 'rowDelta', upserts, removals, unloaded };
  }
}
