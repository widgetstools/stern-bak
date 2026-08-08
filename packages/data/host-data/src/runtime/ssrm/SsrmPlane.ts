/**
 * Per-provider SSRM query plane — thin façade over {@link SsrmServer}.
 * Synced from the hub row cache; answers getRows / status / expressions.
 */
import { composeRowId } from '@wellsfargo-starui/types';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { SsrmServer } from './SsrmServer.js';
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

export function isSsrmProviderType(type: string | undefined): boolean {
  return type === 'stomp-ssrm';
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

  constructor(cfg: ProviderConfig) {
    const keyCol =
      'keyColumn' in cfg
        ? (cfg as { keyColumn?: string | readonly string[] }).keyColumn
        : undefined;
    this.cfgKeyColumn = keyCol;
    this.keyColumn = resolveSsrmKeyColumn(keyCol);
    this.server = new SsrmServer({ keyColumn: this.keyColumn });
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

  getRows(request: SsrmGetRowsRequest): SsrmGetRowsResult {
    return this.server.getRows(request);
  }

  getSetFilterValues(req: SetFilterValuesRequest): string[] {
    return this.server.getSetFilterValues(req);
  }

  getStatusBar(request: StatusBarRequest = {}): StatusBarSummary {
    return this.server.getStatusBar(request);
  }

  configureExpressions(rules: ExpressionRule[]): void {
    this.server.configureExpressions(rules);
  }

  setViewportInterest(sessionId: string, keys: string[]): void {
    this.server.setViewportInterest(sessionId, keys);
  }

  clearViewportInterest(sessionId: string): void {
    this.server.clearViewportInterest(sessionId);
  }

  interestedKeys(sessionId: string, changedKeys: string[] | undefined): string[] {
    return this.server.interestedKeys(sessionId, changedKeys);
  }

  enrichRows(rows: Row[]) {
    return this.server.enrichRows(rows);
  }

  calculatedFields(): string[] {
    return this.server.calculatedFields();
  }

  onTick(listener: (event: TickEvent) => void): () => void {
    return this.server.onTick(listener);
  }

  getStats() {
    return this.server.getStats();
  }
}
