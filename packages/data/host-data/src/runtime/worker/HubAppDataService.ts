/**
 * HubAppDataService — the AppData subsystem of the SharedWorker hub.
 *
 * Single authoritative in-memory store per hub instance plus the ONLY
 * IndexedDB writer for AppData rows; main-thread mirrors are pure RPC
 * clients (set/upsert/remove in, snapshot/delta/ack out) and never
 * touch Dexie themselves.
 *
 * The set/upsert/remove paths are async because they persist to
 * IndexedDB before broadcasting. Callers fire-and-forget — the client
 * receives an `appdata-ack` event when the operation completes
 * (success or failure).
 */

import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type {
  AppDataRequest,
  AppDataAttachRequest,
  AppDataDetachRequest,
  AppDataSetRequest,
  AppDataUpsertRequest,
  AppDataRemoveRequest,
  AppDataEvent,
  AppDataRow,
} from '../protocol.js';
import { WorkerAppDataStore } from './WorkerAppDataStore.js';
import { AppDataConfigStore, type AppDataConfig } from '../providers/appdata/store.js';
import {
  APPDATA_RESYNC_MIN_INTERVAL_MS,
  type PortLike,
  type AppDataListenerEntry,
  type AppDataDeltaEventMutable,
} from './hubTypes.js';

export class HubAppDataService {
  /** In-memory authoritative rows (hydrated from IndexedDB at boot). */
  private readonly memory = new WorkerAppDataStore();
  /** Dexie-backed persistence, or null when no ConfigManager was supplied. */
  private readonly persistence: AppDataConfigStore | null;
  private readonly listeners = new Map<string, AppDataListenerEntry>();
  /** Epoch ms of the last IndexedDB resync (attach throttle). */
  private lastResyncAt = 0;

  constructor(configManager?: ConfigManager) {
    this.persistence = configManager ? new AppDataConfigStore(configManager) : null;

    // Fan store deltas to every attached listener. Set up once;
    // re-attaching listeners doesn't re-subscribe. One reusable event
    // object per delta — postMessage serializes synchronously
    // (PortLike contract), so mutating subId between posts is safe and
    // avoids a per-listener allocation.
    this.memory.subscribe((op, row) => {
      const event: AppDataDeltaEventMutable = {
        kind: 'appdata-delta',
        subId: '',
        op,
        row,
      };
      for (const [, entry] of this.listeners) {
        event.subId = entry.subId;
        try { entry.port.postMessage(event); }
        catch { /* port dead; cleanup happens via onPortClosed */ }
      }
    });
  }

  handleRequest(port: PortLike, req: AppDataRequest): void {
    switch (req.kind) {
      case 'appdata-attach':  void this.handleAttach(port, req); return;
      case 'appdata-detach':  this.handleDetach(req); return;
      case 'appdata-set':     void this.handleSet(port, req); return;
      case 'appdata-upsert':  void this.handleUpsert(port, req); return;
      case 'appdata-remove':  void this.handleRemove(port, req); return;
    }
  }

  /**
   * Read existing AppData rows from IndexedDB and seed the in-memory
   * store. Caller must await this BEFORE handling requests for any
   * port — otherwise late-joiners may observe a partial snapshot.
   *
   * Idempotent. No-op if no ConfigManager was supplied.
   *
   * `userId` only satisfies `AppDataConfigStore.list`'s legacy
   * signature; AppData rows are global so the value doesn't narrow
   * the result.
   */
  async hydrate(userId = 'worker'): Promise<void> {
    if (!this.persistence) return;
    if (this.memory.isHydrated()) return;
    let configs: AppDataConfig[];
    try {
      configs = await this.persistence.list(userId);
    } catch (err) {
      // Non-fatal — store stays un-hydrated and first-attach mirrors
      // send seeds (back-compat path). Log for worker DevTools.
      // eslint-disable-next-line no-console
      console.error('[hub] AppData hydrate failed', err);
      return;
    }
    this.memory.hydrate(configs.map(toAppDataRow));
    // Hydrate IS a fresh IndexedDB read — stamp it so the first mirror
    // attach after boot doesn't immediately rescan the same table.
    this.lastResyncAt = Date.now();
  }

  /**
   * Re-read every AppData row from IndexedDB and reconcile the
   * in-memory store. Called after editor saves (catalog invalidate);
   * mirror attach only triggers it through the resync throttle.
   */
  async resync(userId = 'worker'): Promise<void> {
    if (!this.persistence) return;
    this.lastResyncAt = Date.now();
    let configs: AppDataConfig[];
    try {
      configs = await this.persistence.list(userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hub] AppData resync failed', err);
      return;
    }
    const rows = configs.map(toAppDataRow);
    const nextIds = new Set(rows.map((row) => row.configId));
    for (const existing of this.memory.snapshot()) {
      if (!nextIds.has(existing.configId)) {
        this.memory.remove(existing.configId);
      }
    }
    for (const row of rows) {
      this.memory.upsert(row);
    }
  }

  /** Template-resolution lookup (`{{provider.key}}` → value). */
  get(name: string, key: string): unknown {
    return this.memory.get(name, key);
  }

  /** Current rows (introspect + STOMP cfg tracing). */
  snapshotRows(): readonly AppDataRow[] {
    return this.memory.snapshot();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  /** Drop listeners owned by a closed port. */
  onPortClosed(port: PortLike): void {
    for (const [subId, entry] of this.listeners) {
      if (entry.port === port) this.listeners.delete(subId);
    }
  }

  /** Shutdown only. */
  clear(): void {
    this.listeners.clear();
  }

  // ─── Request handlers ──────────────────────────────────────────

  private async handleAttach(port: PortLike, req: AppDataAttachRequest): Promise<void> {
    // The hub is the sole AppData writer and editor saves already
    // resync via `config-invalidate`, so a full IndexedDB re-read per
    // attaching window is redundant in the common case — and with N
    // windows opening in a burst it serialized N Dexie table scans in
    // front of every snapshot reply. Keep a throttled resync as a
    // safety net for out-of-band writers (e.g. REST-backed
    // ConfigManager mutated from another machine).
    if (
      this.persistence
      && this.memory.isHydrated()
      && Date.now() - this.lastResyncAt >= APPDATA_RESYNC_MIN_INTERVAL_MS
    ) {
      await this.resync();
    } else if (req.seed && !this.memory.isHydrated()) {
      this.memory.hydrate(req.seed);
    }
    this.listeners.set(req.subId, { subId: req.subId, port });
    const event: AppDataEvent = {
      kind: 'appdata-snapshot',
      subId: req.subId,
      rows: this.memory.snapshot(),
    };
    try { port.postMessage(event); }
    catch { this.listeners.delete(req.subId); }
  }

  private handleDetach(req: AppDataDetachRequest): void {
    this.listeners.delete(req.subId);
  }

  private async handleSet(port: PortLike, req: AppDataSetRequest): Promise<void> {
    try {
      // Persist first, in-memory upsert second — if persistence fails,
      // the in-memory state isn't dirtied and the client gets a
      // surfaceable error. AppDataConfigStore.save assigns/preserves
      // configId; we re-read the persisted row so listeners see the
      // hub's final canonical shape (including any timestamp /
      // ownerUserId adjustments).
      const persisted = this.persistence
        ? await this.persistence.save(toAppDataConfig(req.row), req.row.userId)
        : null;
      this.memory.upsert(persisted ? toAppDataRow(persisted) : req.row);
      this.ack(port, req.reqId, true);
    } catch (err) {
      this.ack(port, req.reqId, false, err);
    }
  }

  private async handleUpsert(port: PortLike, req: AppDataUpsertRequest): Promise<void> {
    // upsert is currently identical to set on the wire — both deliver
    // a full row. Kept as a separate kind so future API additions
    // (e.g. partial-merge upsert) don't have to overload `set`.
    try {
      const persisted = this.persistence
        ? await this.persistence.save(toAppDataConfig(req.row), req.row.userId)
        : null;
      this.memory.upsert(persisted ? toAppDataRow(persisted) : req.row);
      this.ack(port, req.reqId, true);
    } catch (err) {
      this.ack(port, req.reqId, false, err);
    }
  }

  private async handleRemove(port: PortLike, req: AppDataRemoveRequest): Promise<void> {
    try {
      if (this.persistence) await this.persistence.remove(req.configId);
      this.memory.remove(req.configId);
      this.ack(port, req.reqId, true);
    } catch (err) {
      this.ack(port, req.reqId, false, err);
    }
  }

  private ack(port: PortLike, reqId: string, ok: boolean, err?: unknown): void {
    const event: AppDataEvent = ok
      ? { kind: 'appdata-ack', reqId, ok: true }
      : { kind: 'appdata-ack', reqId, ok: false, error: err instanceof Error ? err.message : String(err) };
    try { port.postMessage(event); } catch { /* port dead */ }
  }
}

// ─── AppData row ↔ config bridges ──────────────────────────────────
// Wire-shape `AppDataRow` and persistence-shape `AppDataConfig` carry
// the same data; this service speaks both since it sits between the
// wire (rows in/out via postMessage) and IndexedDB (configs in/out
// via AppDataConfigStore).

function toAppDataConfig(r: AppDataRow): AppDataConfig {
  return {
    configId: r.configId,
    name: r.name,
    description: r.description,
    isPublic: r.isPublic,
    values: r.values,
    userId: r.userId,
  };
}

function toAppDataRow(c: AppDataConfig): AppDataRow {
  return {
    configId: c.configId,
    name: c.name,
    description: c.description,
    isPublic: c.isPublic,
    values: c.values,
    userId: c.userId,
  };
}
