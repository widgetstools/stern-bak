/**
 * Per-provider SSRM query plane — thin façade over {@link SsrmServer}.
 * Synced from the hub row cache; answers getRows / status / expressions.
 */
import { composeRowId } from '@wellsfargo-starui/types';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { SsrmServer } from './SsrmServer.js';
import type { SsrmFlushEvent, ViewportInterestScope } from './SsrmServer.js';
import type {
  ExpressionRule,
  Row,
  SetFilterValuesRequest,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TickEvent,
} from './types.js';
import type { StatusBarRequest, StatusBarSummary } from './statusBar.js';

const COMPOSITE_KEY_FIELD = '__ssrmRowId';

export interface SsrmPlaneOpts {
  /**
   * Trailing-edge flush window (ms), forwarded to {@link SsrmServer}.
   * Defaults to the `publishWindowMs` declared on the SSRM `ProviderConfig`
   * variant (`StompSsrmProviderConfig` / `MockSsrmProviderConfig`), or `0`
   * when absent. This only exists so callers that don't shape a full cfg
   * (tests) can override directly.
   */
  publishWindowMs?: number;
  /** Injectable timer (hub pattern) — defaults to `setTimeout`. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  /** Injectable timer clear (hub pattern) — defaults to `clearTimeout`. */
  clearTimer?: (handle: unknown) => void;
}

// Canonical predicate now lives in @wellsfargo-starui/types — re-exported
// here so existing worker-side importers keep their path.
export { isSsrmProviderType } from '@wellsfargo-starui/types';

/**
 * Reads `publishWindowMs` off a `ProviderConfig` via honest discriminated-
 * union narrowing — the field only exists on the two SSRM cfg variants, so
 * a blind structural cast would silently type-check for non-SSRM configs
 * too. `undefined` for every other providerType (including SSRM types the
 * union hasn't been narrowed to, defensively).
 */
function readPublishWindowMs(cfg: ProviderConfig): number | undefined {
  if (cfg.providerType === 'stomp-ssrm' || cfg.providerType === 'mock-ssrm') {
    return cfg.publishWindowMs;
  }
  return undefined;
}

export function resolveSsrmKeyColumn(
  keyColumn: string | readonly string[] | undefined,
): string {
  if (Array.isArray(keyColumn)) return COMPOSITE_KEY_FIELD;
  return keyColumn && String(keyColumn).trim() ? String(keyColumn) : 'id';
}

function normalizeRow(
  row: Row,
  cacheKey: string,
  keyColumn: string | readonly string[] | undefined,
): Row {
  if (Array.isArray(keyColumn)) {
    return { ...row, [COMPOSITE_KEY_FIELD]: cacheKey };
  }
  return row;
}

export class SsrmPlane {
  readonly server: SsrmServer;
  readonly keyColumn: string;
  private readonly cfgKeyColumn: string | readonly string[] | undefined;

  constructor(cfg: ProviderConfig, opts: SsrmPlaneOpts = {}) {
    const keyCol =
      'keyColumn' in cfg
        ? (cfg as { keyColumn?: string | readonly string[] }).keyColumn
        : undefined;
    this.cfgKeyColumn = keyCol;
    this.keyColumn = resolveSsrmKeyColumn(keyCol);
    const publishWindowMs =
      opts.publishWindowMs ?? readPublishWindowMs(cfg) ?? 0;
    this.server = new SsrmServer({
      keyColumn: this.keyColumn,
      publishWindowMs,
      setTimer: opts.setTimer,
      clearTimer: opts.clearTimer,
    });
  }

  /** Replace plane from hub cache Map (keys already composed). */
  syncFromCache(cache: Map<string, unknown>): void {
    const rows: Row[] = [];
    for (const [k, v] of cache) {
      if (!v || typeof v !== 'object') continue;
      rows.push(normalizeRow(v as Row, k, this.cfgKeyColumn));
    }
    this.server.replaceSnapshot(rows);
  }

  /** Upsert a batch of hub rows (cache keys → rows). */
  upsertKeyed(entries: ReadonlyArray<readonly [string, unknown]>): void {
    const rows: Row[] = [];
    for (const [k, v] of entries) {
      if (!v || typeof v !== 'object') continue;
      rows.push(normalizeRow(v as Row, k, this.cfgKeyColumn));
    }
    if (rows.length) this.server.upsert(rows);
  }

  /** Upsert plain rows (key taken from row / composeRowId). */
  upsertRows(rawRows: readonly unknown[]): void {
    const rows: Row[] = [];
    for (const v of rawRows) {
      if (!v || typeof v !== 'object') continue;
      const row = v as Row;
      const k = composeRowId(row, this.cfgKeyColumn);
      if (k == null) continue;
      rows.push(normalizeRow(row, k, this.cfgKeyColumn));
    }
    if (rows.length) this.server.upsert(rows);
  }

  replaceSnapshot(rawRows: readonly unknown[]): void {
    const rows: Row[] = [];
    for (const v of rawRows) {
      if (!v || typeof v !== 'object') continue;
      const row = v as Row;
      const k = composeRowId(row, this.cfgKeyColumn);
      if (k == null) continue;
      rows.push(normalizeRow(row, k, this.cfgKeyColumn));
    }
    this.server.replaceSnapshot(rows);
  }

  getRows(request: SsrmGetRowsRequest, sessionId?: string): SsrmGetRowsResult {
    return this.server.getRows(request, sessionId);
  }

  getSetFilterValues(req: SetFilterValuesRequest): string[] {
    return this.server.getSetFilterValues(req);
  }

  getStatusBar(request: StatusBarRequest = {}): StatusBarSummary {
    return this.server.getStatusBar(request);
  }

  configureExpressions(rules: ExpressionRule[], sessionId?: string): void {
    this.server.configureExpressions(rules, sessionId);
  }

  setViewportInterest(
    sessionId: string,
    keys: string[],
    scope?: ViewportInterestScope,
  ): void {
    this.server.setViewportInterest(sessionId, keys, scope);
  }

  clearViewportInterest(sessionId: string): void {
    this.server.clearViewportInterest(sessionId);
  }

  wantsUnmatchedRows(sessionId: string): boolean {
    return this.server.wantsUnmatchedRows(sessionId);
  }

  interestedKeys(sessionId: string, changedKeys: string[] | undefined): string[] {
    return this.server.interestedKeys(sessionId, changedKeys);
  }

  enrichRows(rows: Row[], sessionId?: string) {
    return this.server.enrichRows(rows, sessionId);
  }

  calculatedFields(sessionId?: string): string[] {
    return this.server.calculatedFields(sessionId);
  }

  onTick(listener: (event: TickEvent) => void): () => void {
    return this.server.onTick(listener);
  }

  /** Subscribe to revision-stamped, windowed flush notifications. See {@link SsrmServer.onFlush}. */
  onFlush(listener: (event: SsrmFlushEvent) => void): () => void {
    return this.server.onFlush(listener);
  }

  /**
   * Reads fresh rows straight from the store for the given keys — the
   * flush-time payload builder. Missing keys (deleted since the flush
   * accumulated them) are dropped rather than surfaced as holes.
   */
  rowsForKeys(keys: string[]): Row[] {
    const rows: Row[] = [];
    for (const key of keys) {
      const row = this.server.store.getRow(key);
      if (row !== undefined) rows.push(row);
    }
    return rows;
  }

  getStats() {
    return this.server.getStats();
  }

  /** Unsubscribes from the store and clears any pending flush timer. */
  dispose(): void {
    this.server.dispose();
  }
}
