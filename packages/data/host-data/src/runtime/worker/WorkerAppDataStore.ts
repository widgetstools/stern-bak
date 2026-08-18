/**
 * WorkerAppDataStore — authoritative in-memory AppData state living
 * inside the SharedWorkerDataServicesHub. Single instance per
 * (origin, worker name); fans deltas to every attached subscriber.
 *
 * Persistence is the originating window's responsibility ("fan-out
 * bus" shape — see docs/plans/plan-2026-05-07/data-services-step2.md
 * §Persistence). The hub itself never writes to ConfigManager; it
 * only mutates its in-memory map and broadcasts.
 *
 * State model:
 *   - `byConfigId`: configId → row (canonical reverse lookup)
 *   - `byName`: name → row (template resolution path)
 *
 * Both maps are kept in sync; `name` collisions silently overwrite
 * (last-writer-wins by hub arrival order — same as today's main-
 * thread store). The hub serialises requests by message-arrival
 * order, so this is deterministic across windows.
 */

import type { AppDataRow } from '../protocol.js';

export interface AppDataListener {
  (op: 'upsert' | 'remove', row: AppDataRow): void;
}

export class WorkerAppDataStore {
  private readonly byConfigId = new Map<string, AppDataRow>();
  private readonly byName = new Map<string, AppDataRow>();
  private readonly listeners = new Set<AppDataListener>();
  /**
   * `true` once the first attaching window has seeded the store.
   * Subsequent attachers just receive the snapshot. The flag exists
   * so we can spot a misuse where a window calls `attach` with no
   * seed before any seed has arrived (we still serve whatever's in
   * memory — empty by default).
   */
  private hydrated = false;

  // ─── Public surface ────────────────────────────────────────────

  /**
   * Lazy hydrate from a seed. Idempotent: only the FIRST non-empty
   * seed wins; subsequent seeds are ignored (ensures the leader
   * window's snapshot is the source of truth, even if a follower
   * later attempts to seed from a stale read).
   */
  hydrate(rows: readonly AppDataRow[]): void {
    if (this.hydrated) return;
    for (const row of rows) this.applyUpsertSilent(row);
    this.hydrated = true;
  }

  /** Whether `hydrate(...)` has been called with any rows. */
  isHydrated(): boolean {
    return this.hydrated;
  }

  /** Snapshot for a freshly-attached subscriber. */
  snapshot(): readonly AppDataRow[] {
    return [...this.byConfigId.values()];
  }

  /** Apply an upsert and fan out the delta. */
  upsert(row: AppDataRow): void {
    this.applyUpsertSilent(row);
    this.fire('upsert', row);
  }

  /** Apply a removal and fan out the delta. Returns the removed row, or null if unknown. */
  remove(configId: string): AppDataRow | null {
    const row = this.byConfigId.get(configId);
    if (!row) return null;
    this.byConfigId.delete(configId);
    // Only drop the name index if it still points at this row — a
    // rename followed by a removal of the OLD configId could otherwise
    // wipe the new row's name lookup.
    if (this.byName.get(row.name) === row) this.byName.delete(row.name);
    this.fire('remove', row);
    return row;
  }

  /** Subscribe to mutations. Returns an unsubscribe. */
  subscribe(listener: AppDataListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Template lookup by provider name + key (worker mirror). */
  get(name: string, key: string): unknown {
    const row = this.byName.get(name);
    if (!row) return undefined;
    return row.values[key];
  }

  /** Number of registered listeners (observability for tests). */
  listenerCount(): number {
    return this.listeners.size;
  }

  // ─── Internals ─────────────────────────────────────────────────

  private applyUpsertSilent(row: AppDataRow): void {
    const previous = this.byConfigId.get(row.configId);
    if (previous && previous.name !== row.name) {
      // The row was renamed. Drop the stale name entry only if it
      // still points at this configId — handles a rare rename-race
      // where two configs flipped names.
      if (this.byName.get(previous.name) === previous) {
        this.byName.delete(previous.name);
      }
    }
    this.byConfigId.set(row.configId, row);
    this.byName.set(row.name, row);
  }

  private fire(op: 'upsert' | 'remove', row: AppDataRow): void {
    // Snapshot listener set so a listener-during-fire that
    // unsubscribes itself doesn't reorder iteration.
    for (const l of [...this.listeners]) {
      try {
        l(op, row);
      } catch (err) {
         
        console.error('[WorkerAppDataStore] listener threw', err);
      }
    }
  }
}
