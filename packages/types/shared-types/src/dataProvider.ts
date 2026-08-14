// DataProvider configuration types for Star Trading Platform
// These configs are stored as UnifiedConfig with componentType='datasource'

/**
 * Provider type enumeration
 */
export const PROVIDER_TYPES = {
  STOMP: 'stomp',
  /** STOMP feed + SharedWorker SSRM query plane (MarketsGrid SSRM). */
  STOMP_SSRM: 'stomp-ssrm',
  REST: 'rest',
  MOCK: 'mock',
  /** Mock feed + SharedWorker SSRM query plane (lab / offline SSRM). */
  MOCK_SSRM: 'mock-ssrm',
  APPDATA: 'appdata'
} as const;

export type ProviderType = typeof PROVIDER_TYPES[keyof typeof PROVIDER_TYPES];

/**
 * Provider type to ComponentSubType mapping
 */
export const PROVIDER_TYPE_TO_COMPONENT_SUBTYPE: Record<ProviderType, string> = {
  [PROVIDER_TYPES.STOMP]: 'stomp',
  [PROVIDER_TYPES.STOMP_SSRM]: 'stomp-ssrm',
  [PROVIDER_TYPES.REST]: 'rest',
  [PROVIDER_TYPES.MOCK]: 'mock',
  [PROVIDER_TYPES.MOCK_SSRM]: 'mock-ssrm',
  [PROVIDER_TYPES.APPDATA]: 'appdata'
};

/**
 * ComponentSubType to Provider type mapping
 */
export const COMPONENT_SUBTYPE_TO_PROVIDER_TYPE: Record<string, ProviderType> = {
  'stomp': PROVIDER_TYPES.STOMP,
  'stomp-ssrm': PROVIDER_TYPES.STOMP_SSRM,
  'rest': PROVIDER_TYPES.REST,
  'mock': PROVIDER_TYPES.MOCK,
  'mock-ssrm': PROVIDER_TYPES.MOCK_SSRM,
  'appdata': PROVIDER_TYPES.APPDATA,
  // Capitalized (backward compatibility)
  'Stomp': PROVIDER_TYPES.STOMP,
  'StompSsrm': PROVIDER_TYPES.STOMP_SSRM,
  'Rest': PROVIDER_TYPES.REST,
  'Mock': PROVIDER_TYPES.MOCK,
  'MockSsrm': PROVIDER_TYPES.MOCK_SSRM,
  'AppData': PROVIDER_TYPES.APPDATA
};

/**
 * Connection state enumeration
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
} as const;

export type ConnectionState = typeof CONNECTION_STATES[keyof typeof CONNECTION_STATES];

/**
 * Field information from schema inference
 */
export interface FieldInfo {
  path: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  nullable: boolean;
  sample?: any;
  children?: Record<string, FieldInfo>;
}

/**
 * Column definition for AG-Grid
 */
export interface ColumnDefinition {
  field: string;
  headerName: string;
  cellDataType?: 'text' | 'number' | 'boolean' | 'date' | 'dateString' | 'object';
  width?: number;
  filter?: string | boolean;
  sortable?: boolean;
  resizable?: boolean;
  hide?: boolean;
  type?: string;
  valueFormatter?: string;
  cellRenderer?: string;
  /**
   * Optional DSL expression compiled to an AG-Grid `valueGetter` at
   * runtime (via `@wellsfargo-starui/core`'s ExpressionEngine). Column refs use
   * bracket syntax — `[cusip]`, `[a.b.c]` for nested, optional-chaining
   * paths — e.g.
   *   `STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null
   *      ? [pnl.wrapper.rdiInventoryName] : [inventoryName]`
   * Empty / absent means no override (column falls back to its `field`
   * binding or the default nested-path getter). The expression never
   * throws at runtime: parse/eval failures fall back to the field value.
   */
  valueGetter?: string;
}

/**
 * STOMP Provider Configuration
 */
export interface StompProviderConfig {
  providerType: 'stomp';
  websocketUrl: string;
  listenerTopic: string;
  requestMessage?: string;
  requestBody?: string;
  snapshotEndToken?: string;
  /**
   * Unique-row identity. A SINGLE column name keys rows by that one
   * field; an array of column names keys rows by the joined values
   * (separator: `-`) — used for datasets with composite primary keys.
   * Drives both the worker-side cache (Hub) and AG-Grid's `getRowId`.
   */
  keyColumn?: string | readonly string[];
  snapshotTimeoutMs?: number;
  manualTopics?: boolean;
  dataType?: 'positions' | 'trades' | 'orders' | 'custom';
  messageRate?: number;
  batchSize?: number;
  autoStart?: boolean;
  heartbeat?: {
    outgoing?: number;
    incoming?: number;
  };
  inferredFields?: FieldInfo[];
  columnDefinitions?: ColumnDefinition[];
  /**
   * Master on/off for live-update conflation. Defaults to ON
   * (`undefined` / `true`). Set `false` to deliver every live row
   * update even when `conflateByKey` / `keyColumn` would otherwise
   * supply a conflation key. This is the explicit disable switch:
   * without it, conflation falls back to `keyColumn` and can't be
   * turned off independently of throttling.
   */
  conflateEnabled?: boolean;
  /**
   * Conflate row updates by this column before fanning out to
   * subscribers. Two updates for the same key value within a
   * `throttleMs` window collapse into the latest one (upsert
   * semantics). Typically set to the same value as `keyColumn` so
   * grids see exactly one update per row per flush. When unset,
   * conflation falls back to `keyColumn`; set `conflateEnabled:
   * false` to turn conflation off entirely.
   */
  conflateByKey?: string;
  /**
   * Master on/off for live-update throttling. Defaults to ON
   * (`undefined` / `true`). Set `false` to fan out every live delta
   * immediately even when `throttleMs` is set — the ms value is kept
   * so re-enabling restores the previous window.
   */
  throttleEnabled?: boolean;
  /**
   * Coalesce row-update fanout into trailing-edge bursts every
   * `throttleMs`. 0 / undefined → immediate fanout (no batching).
   * The conflation window above only takes effect when this is set
   * and `throttleEnabled` is not `false`.
   */
  throttleMs?: number;
  /**
   * Max rows shipped per `postMessage` when flushing the snapshot from
   * the worker to the client. Larger snapshots split into this many
   * rows per replace/delta frame so each main-thread `message`
   * deserialize stays under Chromium's ~50ms long-task budget.
   * Default 500. Settable in code (author the config) or via the
   * provider editor.
   */
  snapshotChunkSize?: number;
  /**
   * Prune incoming rows to the fields the UI can actually see — the
   * `columnDefinitions[].field` paths plus `keyColumn` — at frame-parse
   * time in the worker, BEFORE rows enter the snapshot buffer / hub
   * cache. Upstream feeds that ship wide objects (e.g. 2000 fields when
   * the blotter renders 200) otherwise pay ~10x on worker memory,
   * snapshot encode, postMessage payloads and client parse in every
   * window. Nested paths (`a.b.c`) copy just the needed subtree.
   * Default OFF. Changing the visible fields requires a provider
   * restart (the editor's Restart already rebuilds the slot from the
   * new cfg).
   */
  projectFields?: boolean;
  /**
   * Thin field-level deltas. When ON, post-ready live updates broadcast
   * only the top-level fields that actually changed per row
   * (`delta-patch` wire events) instead of full replacement rows —
   * touch updates that change a few fields out of hundreds shrink the
   * hub→window wire by the touch ratio. The client merges each patch
   * into its previous full row producing a NEW row object, so
   * subscribers still observe whole immutable rows. Requires
   * `keyColumn` (ignored without it). Snapshot/replace frames always
   * ship full rows. Default OFF.
   */
  thinDeltas?: boolean;
  /**
   * Wire codec for binary hub→window frames (snapshot replay, restart
   * broadcast, large live batches).
   *   - `'json'` (default) — UTF-8 `JSON.stringify` bytes, decoded
   *     with `JSON.parse`.
   *   - `'columnar'` — typed-array columnar frames: numbers travel as
   *     raw Float64 and booleans as bitmaps, cutting each window's
   *     per-frame decode several-fold on number-heavy feeds. Frames
   *     that don't qualify (non-object rows) fall back to JSON
   *     per-chunk automatically.
   */
  wireFormat?: 'json' | 'columnar';
  /**
   * Reconnect policy — `initialDelayMs` becomes the stompjs
   * `reconnectDelay`. Default 5000.
   */
  reconnect?: {
    /** Static reconnect delay in ms. Default 5000 (matches prior behaviour). */
    initialDelayMs?: number;
  };
}

/**
 * STOMP + SSRM Provider Configuration.
 *
 * Same wire/transport as {@link StompProviderConfig}; the SharedWorker
 * attaches an SSRM query plane so grids use `rowModelType: 'serverSide'`.
 */
export interface StompSsrmProviderConfig
  extends Omit<StompProviderConfig, 'providerType'> {
  providerType: 'stomp-ssrm';
  /** Hint for AG Grid `cacheBlockSize` (client); worker pages by request. */
  blockSize?: number;
  /**
   * Trailing-edge SSRM flush window in ms; 0/omitted = per-frame
   * passthrough. Accumulates and key-conflates changed rows across the
   * window before the worker fans a single `ssrm-tick` — see
   * `SsrmServer`/`SsrmPlane` in `@wellsfargo-starui/data`.
   */
  publishWindowMs?: number;
}

/**
 * REST Provider Configuration
 */
export interface RestProviderConfig {
  providerType: 'rest';
  baseUrl: string;
  endpoint: string;
  method: 'GET' | 'POST';
  queryParams?: Record<string, string>;
  body?: string;
  headers?: Record<string, string>;
  pollInterval?: number;
  paginationMode?: 'offset' | 'cursor' | 'page';
  pageSize?: number;
  auth?: {
    type: 'bearer' | 'apikey' | 'basic';
    credentials: string;
    headerName?: string;
  };
  timeout?: number;
  /**
   * Required for streaming consumers (MarketsGrid). The column whose
   * value uniquely identifies a row — drives RowCache upsert + AG-Grid
   * `getRowId`. Accepts an array of column names for composite keys
   * (joined with `-`).
   */
  keyColumn?: string | readonly string[];
  /**
   * Path inside the JSON response that holds the rows array.
   * Dot notation; e.g. `data.results`. Default: response is the
   * rows array directly.
   */
  rowsPath?: string;
  /** Persisted schema introspection — see StompProviderConfig. */
  inferredFields?: FieldInfo[];
  columnDefinitions?: ColumnDefinition[];
  /** See StompProviderConfig — same fanout knobs apply. */
  conflateByKey?: string;
  throttleMs?: number;
}

/**
 * Mock Provider Configuration
 */
export interface MockProviderConfig {
  providerType: 'mock';
  dataType: 'positions' | 'trades' | 'orders' | 'custom';
  updateInterval?: number;
  /** Alias for `updateInterval` in ms — preserved for UI template compatibility. */
  updateIntervalMs?: number;
  rowCount?: number;
  enableUpdates?: boolean;
  customData?: any[];
  /**
   * Unique-row identity, same semantics as the other streaming
   * configs. Required when this cfg is attached through the
   * SharedWorker hub (`useProviderStream` / `client.attach`) — the
   * hub keys its row cache by `keyColumn` and silently drops rows
   * that don't resolve a value, so a missing field surfaces as an
   * empty grid. Safe to omit when calling `startMock` directly
   * in-process (the in-process path doesn't go through the cache).
   *
   * Typical values per dataType: `'cusip'` for positions,
   * `'tradeId'` for trades, `'id'` for orders.
   */
  keyColumn?: string | readonly string[];
}

/**
 * Mock + SSRM Provider Configuration.
 *
 * Same row generator as {@link MockProviderConfig}; the SharedWorker
 * attaches an SSRM query plane so grids use `rowModelType: 'serverSide'`
 * with lab-parity field names (`id`, `cusip`, `bidPrice`, …).
 */
export interface MockSsrmProviderConfig
  extends Omit<MockProviderConfig, 'providerType'> {
  providerType: 'mock-ssrm';
  /** Hint for AG Grid `cacheBlockSize` (client); worker pages by request. */
  blockSize?: number;
  /** Optional persisted column schema for SSRM grids / editors. */
  columnDefinitions?: ColumnDefinition[];
  /**
   * Trailing-edge SSRM flush window in ms; 0/omitted = per-frame
   * passthrough. Accumulates and key-conflates changed rows across the
   * window before the worker fans a single `ssrm-tick` — see
   * `SsrmServer`/`SsrmPlane` in `@wellsfargo-starui/data`.
   */
  publishWindowMs?: number;
}

/**
 * AppData Variable
 */
export interface AppDataVariable {
  key: string;
  value: string | number | boolean | object;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  sensitive?: boolean;
}

/**
 * AppData Provider Configuration
 */
export interface AppDataProviderConfig {
  providerType: 'appdata';
  variables: Record<string, AppDataVariable>;
}

/**
 * Union type for all provider configurations
 */
export type ProviderConfig =
  | StompProviderConfig
  | StompSsrmProviderConfig
  | RestProviderConfig
  | MockProviderConfig
  | MockSsrmProviderConfig
  | AppDataProviderConfig;

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  hasSnapshot: boolean;
  hasRealtime: boolean;
  hasPagination: boolean;
  hasFiltering: boolean;
  hasSorting: boolean;
  hasSearch: boolean;
  maxRowsPerRequest?: number;
}

/**
 * Provider statistics for monitoring
 */
export interface ProviderStatistics {
  snapshotRowsReceived: number;
  updateRowsReceived: number;
  bytesReceived: number;
  snapshotBytesReceived: number;
  updateBytesReceived: number;
  connectionCount: number;
  disconnectionCount: number;
  isConnected: boolean;
  mode: 'idle' | 'snapshot' | 'realtime';
  lastMessageTime: number | null;
  connectionDuration?: number;
  errorCount?: number;
}

/**
 * Template variables for STOMP topic resolution
 */
export interface TemplateVariables {
  clientId: string;
  userId?: string;
  timestamp?: number;
  [key: string]: string | number | undefined;
}

/**
 * DataProvider configuration wrapper
 */
export interface DataProviderConfig {
  providerId?: string;
  name: string;
  description?: string;
  providerType: ProviderType;
  config: ProviderConfig;
  tags?: string[];
  isDefault?: boolean;
  userId: string;
  /**
   * Visibility:
   *   true  → row is saved with userId='system' (visible to everyone
   *           sharing the appId).
   *   false / undefined → row is saved with the active userId
   *           (visible only to the author).
   *
   * The configurator surfaces this as a single "Public" toggle.
   */
  public?: boolean;
}

/**
 * Validation result for provider configurations
 */
export interface ProviderValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Provider connection test result
 */
export interface ProviderTestResult {
  success: boolean;
  connectionState: ConnectionState;
  responseTime?: number;
  error?: string;
  metadata?: {
    serverVersion?: string;
    capabilities?: ProviderCapabilities;
    sampleData?: any[];
  };
}

/**
 * Default provider configurations for quick setup
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<ProviderType, Partial<ProviderConfig>> = {
  stomp: {
    providerType: 'stomp',
    listenerTopic: '',
    websocketUrl: '',
    snapshotEndToken: 'Success',
    requestBody: 'START',
    snapshotTimeoutMs: 60000,
    manualTopics: false,
    dataType: 'positions',
    messageRate: 1000,
    autoStart: false,
    heartbeat: {
      outgoing: 4000,
      incoming: 4000
    },
    inferredFields: [],
    columnDefinitions: []
  },
  'stomp-ssrm': {
    providerType: 'stomp-ssrm',
    listenerTopic: '',
    websocketUrl: '',
    snapshotEndToken: 'Success',
    requestBody: 'START',
    snapshotTimeoutMs: 60000,
    manualTopics: false,
    dataType: 'positions',
    messageRate: 1000,
    autoStart: false,
    blockSize: 100,
    heartbeat: {
      outgoing: 4000,
      incoming: 4000
    },
    inferredFields: [],
    columnDefinitions: []
  },
  rest: {
    providerType: 'rest',
    baseUrl: '',
    endpoint: '',
    method: 'GET',
    pollInterval: 5000,
    pageSize: 100,
    timeout: 30000
  },
  mock: {
    providerType: 'mock',
    dataType: 'positions',
    updateInterval: 2000,
    rowCount: 20,
    enableUpdates: true
  },
  'mock-ssrm': {
    providerType: 'mock-ssrm',
    dataType: 'positions',
    updateInterval: 500,
    updateIntervalMs: 500,
    rowCount: 500,
    enableUpdates: true,
    keyColumn: 'id',
    blockSize: 100,
    columnDefinitions: []
  },
  appdata: {
    providerType: 'appdata',
    variables: {}
  }
};

/**
 * Helper function to get default config for a provider type
 */
export function getDefaultProviderConfig(type: ProviderType): Partial<ProviderConfig> {
  return { ...DEFAULT_PROVIDER_CONFIGS[type] };
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: ProviderConfig): ProviderValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.providerType) {
    errors.push('Provider type is required');
  }

  // Hard errors mirror what the transports actually require: the STOMP
  // transport dials `websocketUrl` verbatim (transports/stomp.ts) and the
  // REST transport refuses to start without `baseUrl` + `endpoint`
  // (transports/rest.ts). Anything the transport would reject at attach
  // time must be rejected at save time.
  switch (config.providerType) {
    case 'stomp':
    case 'stomp-ssrm': {
      const stompConfig = config as StompProviderConfig | StompSsrmProviderConfig;
      if (!stompConfig.websocketUrl || stompConfig.websocketUrl.trim().length === 0) {
        errors.push('WebSocket URL is required for STOMP providers');
      } else if (!stompConfig.websocketUrl.startsWith('ws://') && !stompConfig.websocketUrl.startsWith('wss://')) {
        warnings.push('WebSocket URL should typically start with ws:// or wss://');
      }
      if (!stompConfig.listenerTopic || stompConfig.listenerTopic.trim().length === 0) {
        errors.push('Listener topic is required for STOMP providers');
      }
      break;
    }
    case 'rest': {
      const restConfig = config as RestProviderConfig;
      if (!restConfig.baseUrl || restConfig.baseUrl.trim().length === 0) {
        errors.push('Base URL is required for REST providers');
      } else if (!restConfig.baseUrl.startsWith('http://') && !restConfig.baseUrl.startsWith('https://')) {
        warnings.push('Base URL should typically start with http:// or https://');
      }
      if (!restConfig.endpoint || restConfig.endpoint.trim().length === 0) {
        errors.push('Endpoint is required for REST providers');
      }
      if (restConfig.pollInterval && restConfig.pollInterval < 1000) {
        warnings.push('Poll interval is very low (< 1 second), may cause high server load');
      }
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ─── Row-id derivation ────────────────────────────────────────────────

/** Separator used when composing row ids from multiple key columns. */
export const COMPOSITE_KEY_SEPARATOR = '-';

/**
 * Provider lifecycle status as surfaced to subscribers (hub `status`
 * events, `IDataProvider.onStatus`, grid loading overlays). Lives in
 * the foundation layer so UI packages can type against it without a
 * dependency edge on `@wellsfargo-starui/data` (which re-exports it for its
 * own consumers).
 */
export type ProviderStatus = 'loading' | 'ready' | 'error';

/**
 * Normalize a `keyColumn` config value (single string OR array) into a
 * readonly array of column names. Empty / whitespace-only entries are
 * dropped. Returns `null` when no usable column is configured.
 *
 * Memoized: `composeRowId` runs per ROW on every hot path (hub cache
 * upsert, conflation key, AG Grid getRowId) while `keyColumn` is
 * config that never changes — un-memoized this allocated ~4 throwaway
 * arrays per row. Strings memoize by value (bounded); arrays by
 * reference (WeakMap — unstable caller arrays just skip the cache).
 */
const NORMALIZED_BY_STRING = new Map<string, readonly string[] | null>();
const NORMALIZED_BY_ARRAY = new WeakMap<readonly string[], readonly string[] | null>();
const NORMALIZED_STRING_CACHE_MAX = 1000;

function normalizeKeyColumnsUncached(
  arr: readonly unknown[],
): readonly string[] | null {
  const cleaned = arr
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeKeyColumns(
  keyColumn: string | readonly string[] | null | undefined,
): readonly string[] | null {
  if (keyColumn == null) return null;
  if (typeof keyColumn === 'string') {
    let cached = NORMALIZED_BY_STRING.get(keyColumn);
    if (cached === undefined) {
      cached = normalizeKeyColumnsUncached([keyColumn]);
      if (NORMALIZED_BY_STRING.size >= NORMALIZED_STRING_CACHE_MAX) {
        NORMALIZED_BY_STRING.clear();
      }
      NORMALIZED_BY_STRING.set(keyColumn, cached);
    }
    return cached;
  }
  if (!Array.isArray(keyColumn)) return null;
  let cached = NORMALIZED_BY_ARRAY.get(keyColumn);
  if (cached === undefined) {
    cached = normalizeKeyColumnsUncached(keyColumn);
    NORMALIZED_BY_ARRAY.set(keyColumn, cached);
  }
  return cached;
}

/**
 * Resolve a value at a dot-separated path on a row.
 *
 * Behaviour:
 *   1. If the row carries a literal flat key matching the FULL path
 *      (e.g. `row['weird.key']`), that wins. This handles the rare
 *      case where source data legitimately encodes dots in keys.
 *   2. Otherwise, split on `.` and walk nested objects:
 *      `getValueByPath({a:{b:{c:1}}}, 'a.b.c') === 1`.
 *   3. Returns `undefined` for any missing segment along the way.
 *
 * Mirrors what AG-Grid's auto-dot-walk does, with the literal-key
 * priority added so consumers don't accidentally lose data on weird
 * upstream feeds.
 */
export function getValueByPath(row: unknown, path: string): unknown {
  if (row == null || typeof row !== 'object') return undefined;
  const obj = row as Record<string, unknown>;
  // Step 1 — literal flat key wins (handles `{"weird.key": …}`).
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
  // Step 2 — dot-walk nested objects.
  if (!path.includes('.')) return undefined;
  let cursor: unknown = obj;
  for (const seg of path.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

// ─── Compiled path accessor cache ─────────────────────────────────────
// Closure-per-path cache shared between ColDef valueGetters (via
// `nestedField()` in @wellsfargo-starui/grid) and the expression engine's
// `[…]` reference resolution. See:
//   - docs/PUBLIC_API_SPEC.md §2.5 (nestedField factory)
//   - docs/PUBLIC_API_SPEC.md §10.3 (bracket-reference syntax)
//   - docs/plans/nested-fields-design.md (full design)
//
// Identity guarantee: `getPathAccessor(p) === getPathAccessor(p)` for
// any path `p`. Callers may rely on stable closure identity for
// memoisation / cache keys.

const accessorCache = new Map<string, (row: unknown) => unknown>();
const setterCache   = new Map<string, (row: unknown, value: unknown) => boolean>();

/**
 * Return a cached closure that reads `path` from a row.
 *
 * Semantics match {@link getValueByPath}: literal-flat-key priority
 * on the root, then null-safe dot-walk. The closure is cached by
 * `path` string so identity is stable across calls — safe to use as
 * a memoisation key.
 *
 * Returns `undefined` for non-object roots.
 */
export function getPathAccessor(path: string): (row: unknown) => unknown {
  const cached = accessorCache.get(path);
  if (cached) return cached;

  let fn: (row: unknown) => unknown;
  if (!path.includes('.')) {
    // Fast path — single segment, no walking.
    fn = (row) => {
      if (row == null || typeof row !== 'object') return undefined;
      return (row as Record<string, unknown>)[path];
    };
  } else {
    const segments = path.split('.');
    fn = (row) => {
      if (row == null || typeof row !== 'object') return undefined;
      const obj = row as Record<string, unknown>;
      // Step 1 — literal flat key wins on the ROOT only.
      if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
      // Step 2 — null-safe dot-walk with cached segments array.
      let cursor: unknown = obj;
      for (let i = 0; i < segments.length; i++) {
        if (cursor == null || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[segments[i] as string];
      }
      return cursor;
    };
  }
  accessorCache.set(path, fn);
  return fn;
}

/**
 * Return a cached closure that writes `value` to `path` on a row,
 * creating intermediate plain-object segments as needed.
 *
 * Returns `true` if the write changed the value (`!Object.is(old, new)`),
 * `false` if it was a no-op or the root is not an object. Mutates the
 * row in place.
 *
 * Unlike the read path, the setter does NOT honour the literal-flat-key
 * priority — writing through `"x.y"` always creates `{ x: { y: value } }`.
 * The read priority is a defence against weird upstream feeds; the
 * write is an intentional structural commitment.
 */
export function getPathSetter(path: string): (row: unknown, value: unknown) => boolean {
  const cached = setterCache.get(path);
  if (cached) return cached;

  let fn: (row: unknown, value: unknown) => boolean;
  if (!path.includes('.')) {
    fn = (row, value) => {
      if (row == null || typeof row !== 'object') return false;
      const obj = row as Record<string, unknown>;
      if (Object.is(obj[path], value)) return false;
      obj[path] = value;
      return true;
    };
  } else {
    const segments = path.split('.');
    const lastIdx = segments.length - 1;
    fn = (row, value) => {
      if (row == null || typeof row !== 'object') return false;
      let cursor = row as Record<string, unknown>;
      for (let i = 0; i < lastIdx; i++) {
        const seg = segments[i] as string;
        const next = cursor[seg];
        if (next == null || typeof next !== 'object') {
          const made: Record<string, unknown> = {};
          cursor[seg] = made;
          cursor = made;
        } else {
          cursor = next as Record<string, unknown>;
        }
      }
      const finalSeg = segments[lastIdx] as string;
      if (Object.is(cursor[finalSeg], value)) return false;
      cursor[finalSeg] = value;
      return true;
    };
  }
  setterCache.set(path, fn);
  return fn;
}

/**
 * Test-only helper to reset the path-accessor caches between unit
 * tests. Not part of the public API — exists so per-test state
 * doesn't bleed across suites.
 */
export function __resetPathAccessorCaches(): void {
  accessorCache.clear();
  setterCache.clear();
}

/**
 * Compose a unique row id from one or more configured key columns.
 *
 * - **Single column**: returns the row's value at that column, stringified.
 * - **Composite (≥ 2 columns)**: joins each column's stringified value
 *   with `-`, e.g. `col1=A, col2=B, col3=42` → `"A-B-42"`.
 * - **Nested key columns**: dot-separated paths (e.g. `position.id`) are
 *   resolved via `getValueByPath`, which dot-walks nested objects with
 *   a literal-flat-key fallback. Required because feeds frequently
 *   surface row identity inside a nested envelope (e.g.
 *   `{ meta: { id: 'POS-42' }, … }`) and the FieldsTab tree exposes
 *   those paths as candidate key columns directly.
 * - **Missing values**: if ANY configured column resolves to null/undefined,
 *   returns `null` — the caller treats the row as un-keyable.
 *   Surfacing a row whose composite key is partially-defined would silently
 *   conflate distinct rows under a sentinel like `"A--42"`.
 *
 * Used by both the worker-side Hub cache and AG-Grid's `getRowId` so the
 * cache key and the grid row id stay byte-identical (required for live
 * updates to find the right rendered row).
 */
export function composeRowId(
  row: unknown,
  keyColumn: string | readonly string[] | null | undefined,
): string | null {
  const cols = normalizeKeyColumns(keyColumn);
  if (!cols || !row || typeof row !== 'object') return null;
  if (cols.length === 1) {
    const v = getValueByPath(row, cols[0]);
    if (v === null || v === undefined) return null;
    return String(v);
  }
  const parts: string[] = [];
  for (const col of cols) {
    const v = getValueByPath(row, col);
    if (v === null || v === undefined) return null;
    parts.push(String(v));
  }
  return parts.join(COMPOSITE_KEY_SEPARATOR);
}
