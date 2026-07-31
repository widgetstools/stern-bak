/**
 * AppDataMirror — main-thread synchronous-read view of the
 * authoritative AppData state held by the SharedWorkerDataServicesHub.
 *
 * Responsibilities:
 *   - Apply snapshot + delta events from the worker, keep two indexes
 *     in sync (`byConfigId`, `byName`).
 *   - Expose `get(name, key)` SYNCHRONOUSLY so template resolution
 *     (`{{positions.asOfDate}}`) doesn't have to await on the render
 *     path.
 *   - Provide async `set` / `upsertConfig` / `remove` that post the
 *     row to the hub. The hub persists to IndexedDB AND broadcasts
 *     the delta back; the mirror's pending-ack handler resolves once
 *     both steps complete. The mirror itself never touches Dexie —
 *     worker is the sole IndexedDB writer.
 *
 * This is the "worker-owned" persistence shape from
 * `data-services-redesign.md` §3, replacing the Step 2 fan-out bus.
 */

import type {
  AppDataAckEvent,
  AppDataDeltaEvent,
  AppDataRequest,
  AppDataRow,
  AppDataSnapshotEvent,
} from '../protocol.js';
import type { AppDataConfig } from '../providers/appdata/store.js';
import { PUBLIC_USER_ID } from '../config/store.js';

export interface AppDataMirrorOpts {
  /** Identifier for this mirror's subscription on the hub. */
  subId: string;
  /** Logged-in user id — used as `userId` on freshly-created rows. */
  userId: string;
  /**
   * Send an AppData request to the hub. The mirror does NOT depend
   * on the client class directly — anything that can serialise an
   * `AppDataRequest` works (used in tests with `createInPageWiring`).
   */
  send: (req: AppDataRequest) => void;
}

interface PendingAck {
  resolve: () => void;
  reject: (err: Error) => void;
}

let nextReqId = 0;
function makeReqId(): string {
  return `req-${++nextReqId}-${Date.now()}`;
}

export class AppDataMirror {
  private readonly subId: string;
  private readonly send: (req: AppDataRequest) => void;
  private readonly userId: string;

  private readonly byConfigId = new Map<string, AppDataRow>();
  private readonly byName = new Map<string, AppDataRow>();
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, PendingAck>();

  private snapshotApplied = false;
  private readonly readyPromise: Promise<void>;
  private readyResolve: (() => void) | null = null;

  constructor(opts: AppDataMirrorOpts) {
    this.subId = opts.subId;
    this.send = opts.send;
    this.userId = opts.userId;
    this.readyPromise = new Promise<void>((resolve) => { this.readyResolve = resolve; });
  }

  // ─── Wire-up (called by the client) ─────────────────────────────

  /**
   * Send the initial attach. The hub already holds authoritative
   * AppData state (hydrated from its own IndexedDB connection at
   * worker boot), so the mirror sends no seed — the hub responds
   * with the snapshot it already has.
   *
   * Idempotent. The client owns event routing; it calls this once
   * per mirror.
   */
  async attach(): Promise<void> {
    this.send({ kind: 'appdata-attach', subId: this.subId });
  }

  /**
   * Route an AppData event from the hub. The client's message
   * dispatcher dispatches by `subId` for delta/snapshot events and
   * by `reqId` for ack events.
   */
  handleEvent(event: AppDataSnapshotEvent | AppDataDeltaEvent | AppDataAckEvent): void {
    switch (event.kind) {
      case 'appdata-snapshot':
        this.applySnapshot(event.rows);
        return;
      case 'appdata-delta':
        if (event.op === 'upsert') this.applyUpsert(event.row);
        else this.applyRemove(event.row.configId);
        this.fire();
        return;
      case 'appdata-ack': {
        const pending = this.pending.get(event.reqId);
        if (!pending) return;
        this.pending.delete(event.reqId);
        if (event.ok) pending.resolve();
        else pending.reject(new Error(event.error ?? 'AppData operation failed'));
        return;
      }
    }
  }

  // ─── Public surface (consumed by hooks and direct callers) ───────

  /** Sync read. Returns undefined for unknown name/key or pre-snapshot. */
  get(name: string, key: string): unknown {
    const row = this.byName.get(name);
    if (!row) return undefined;
    return row.values[key];
  }

  /** All rows in arbitrary order. */
  list(): readonly AppDataConfig[] {
    return [...this.byConfigId.values()].map(rowToConfig);
  }

  /** Whether the initial snapshot has been applied. */
  isReady(): boolean {
    return this.snapshotApplied;
  }

  /** Resolves once the initial snapshot has arrived. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Set a single key on a named provider. Creates the row if it
   * doesn't exist. The hub persists then broadcasts; resolution
   * means the row is durable AND every attached mirror (including
   * this one) has applied the delta.
   */
  async set(name: string, key: string, value: unknown): Promise<void> {
    const existing = this.byName.get(name);
    const config: AppDataConfig = existing
      ? rowToConfig({ ...existing, values: { ...existing.values, [key]: value } })
      : {
          configId: '',
          name,
          isPublic: false,
          values: { [key]: value },
          userId: this.userId === PUBLIC_USER_ID ? PUBLIC_USER_ID : this.userId,
        };
    await this.upsertConfig(config);
  }

  /**
   * Replace an entire AppData row. Sends the row to the hub which
   * persists to IndexedDB then broadcasts. Resolves once the ack
   * arrives.
   *
   * The mirror returns its INPUT config (with whatever configId the
   * caller provided, or empty for new rows) — the hub assigns a
   * configId on first save and broadcasts the canonical row. Callers
   * who need the canonical configId can read it from the next delta
   * via `subscribe()` or look up by name in `list()` once the ack
   * resolves.
   */
  async upsertConfig(config: AppDataConfig): Promise<AppDataConfig> {
    const row = toRow({
      configId: config.configId,
      name: config.name,
      ...(config.description !== undefined ? { description: config.description } : {}),
      isPublic: config.isPublic,
      values: config.values,
      userId: config.isPublic ? PUBLIC_USER_ID : (config.userId || this.userId),
    });
    await this.broadcastUpsert(row);
    return config;
  }

  /**
   * Writes every key for a named AppData row in **one** hub round-trip.
   * Used by `ConfigManager.publishApplicationContext` so a new window
   * does not queue four separate IndexedDB writes behind a busy
   * SharedWorker (e.g. a large grid subscription in another view).
   *
   * Merges with any existing row by `name` so unrelated keys stay
   * intact; keys in `values` overwrite / add.
   */
  async publishNamedRow(name: string, values: Record<string, unknown>): Promise<void> {
    const row = this.byName.get(name);
    const config: AppDataConfig = row
      ? { ...rowToConfig(row), values: { ...row.values, ...values } }
      : {
          configId: '',
          name,
          isPublic: false,
          values: { ...values },
          userId: this.userId === PUBLIC_USER_ID ? PUBLIC_USER_ID : this.userId,
        };
    await this.upsertConfig(config);
  }

  /** Delete an AppData row by configId. Hub removes from IndexedDB
   *  and broadcasts the delete delta. */
  async remove(configId: string): Promise<void> {
    const reqId = makeReqId();
    const ack = this.awaitAck(reqId);
    this.send({ kind: 'appdata-remove', reqId, configId });
    await ack;
  }

  /** Subscribe to ANY change. Listener fires after the local mirror
   *  is updated. Returns unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Internals ─────────────────────────────────────────────────

  private async broadcastUpsert(row: AppDataRow): Promise<void> {
    const reqId = makeReqId();
    const ack = this.awaitAck(reqId);
    this.send({ kind: 'appdata-set', reqId, row });
    await ack;
  }

  private awaitAck(reqId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
    });
  }

  private applySnapshot(rows: readonly AppDataRow[]): void {
    this.byConfigId.clear();
    this.byName.clear();
    for (const row of rows) {
      this.byConfigId.set(row.configId, row);
      this.byName.set(row.name, row);
    }
    this.snapshotApplied = true;
    this.readyResolve?.();
    this.fire();
  }

  private applyUpsert(row: AppDataRow): void {
    const previous = this.byConfigId.get(row.configId);
    if (previous && previous.name !== row.name) {
      if (this.byName.get(previous.name) === previous) {
        this.byName.delete(previous.name);
      }
    }
    this.byConfigId.set(row.configId, row);
    this.byName.set(row.name, row);
  }

  private applyRemove(configId: string): void {
    const row = this.byConfigId.get(configId);
    if (!row) return;
    this.byConfigId.delete(configId);
    if (this.byName.get(row.name) === row) this.byName.delete(row.name);
  }

  private fire(): void {
    for (const l of [...this.listeners]) {
      try { l(); } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppDataMirror] listener threw', err);
      }
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function toRow(c: AppDataConfig): AppDataRow {
  return {
    configId: c.configId,
    name: c.name,
    description: c.description,
    isPublic: c.isPublic,
    values: c.values,
    userId: c.userId,
  };
}

function rowToConfig(r: AppDataRow): AppDataConfig {
  return {
    configId: r.configId,
    name: r.name,
    description: r.description,
    isPublic: r.isPublic,
    values: r.values,
    userId: r.userId,
  };
}
