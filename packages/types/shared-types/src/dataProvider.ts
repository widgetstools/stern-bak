// DataProvider configuration types for Star Trading Platform
// These configs are stored as UnifiedConfig with componentType='datasource'

/**
 * Provider type enumeration
 */
export const PROVIDER_TYPES = {
  STOMP: 'stomp',
  REST: 'rest',
  WEBSOCKET: 'websocket',
  SOCKETIO: 'socketio',
  MOCK: 'mock',
  APPDATA: 'appdata'
} as const;

export type ProviderType = typeof PROVIDER_TYPES[keyof typeof PROVIDER_TYPES];

/**
 * Provider type to ComponentSubType mapping
 */
export const PROVIDER_TYPE_TO_COMPONENT_SUBTYPE: Record<ProviderType, string> = {
  [PROVIDER_TYPES.STOMP]: 'stomp',
  [PROVIDER_TYPES.REST]: 'rest',
  [PROVIDER_TYPES.WEBSOCKET]: 'websocket',
  [PROVIDER_TYPES.SOCKETIO]: 'socketio',
  [PROVIDER_TYPES.MOCK]: 'mock',
  [PROVIDER_TYPES.APPDATA]: 'appdata'
};

/**
 * ComponentSubType to Provider type mapping
 */
export const COMPONENT_SUBTYPE_TO_PROVIDER_TYPE: Record<string, ProviderType> = {
  'stomp': PROVIDER_TYPES.STOMP,
  'rest': PROVIDER_TYPES.REST,
  'websocket': PROVIDER_TYPES.WEBSOCKET,
  'socketio': PROVIDER_TYPES.SOCKETIO,
  'mock': PROVIDER_TYPES.MOCK,
  'appdata': PROVIDER_TYPES.APPDATA,
  // Capitalized (backward compatibility)
  'Stomp': PROVIDER_TYPES.STOMP,
  'Rest': PROVIDER_TYPES.REST,
  'WebSocket': PROVIDER_TYPES.WEBSOCKET,
  'SocketIO': PROVIDER_TYPES.SOCKETIO,
  'Mock': PROVIDER_TYPES.MOCK,
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
/**
 * Where a provider's data plane runs — see `StompProviderConfig.dataPlane`.
 * Honoured by the hub for every provider type. `'engine'` is `'subworker'`
 * plus a shadow Perspective engine table inside the provider's worker
 * (Phase 2 of docs/wasm-data-plane-plan.md; measurement stage).
 */
export type DataPlane = 'hub' | 'subworker' | 'engine';

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
   * STOMP client implementation.
   *   - `'fast'` (default) — the platform's vectorized frame parser
   *     (`fastStompClient`): native `indexOf` boundary scans instead of
   *     @stomp/stompjs's per-byte state machine, which measured ~30% of
   *     the SharedWorker thread at ~4.4MB/s. Covers the protocol
   *     surface the platform uses (CONNECTED/MESSAGE/ERROR, heart-beats,
   *     auto-redial); no transactions/acks/receipts.
   *   - `'stompjs'` — the @stomp/stompjs Client, kept as an escape
   *     hatch for brokers with behaviours the fast client doesn't
   *     cover.
   */
  stompImpl?: 'fast' | 'stompjs';
  /**
   * Where the provider's data plane runs. `'subworker'` — the shipped
   * hub's default — runs the connection, frame parsing, conflation, row
   * cache, replay and encoding in the provider's own SharedWorker, so a
   * busy feed cannot starve the hub's fan-out (nor the reverse); `'hub'`
   * opts this provider back onto the hub thread. Unset defers to the
   * hub's configured default (`SharedWorkerDataServicesHubOpts.dataPlane`;
   * the class default is `'hub'`, the shipped worker entry passes
   * `'subworker'`). Falls back to the hub thread automatically where
   * sub-workers are unavailable. Requires a provider Restart.
   */
  dataPlane?: DataPlane;
  /**
   * Reconnect policy. Today only `initialDelayMs` is honoured (it
   * becomes the stompjs `reconnectDelay`); full exponential backoff +
   * jitter + maxAttempts requires bypassing stompjs's auto-reconnect
   * and is tracked as a follow-up. The fields are reserved here so
   * configurators can author them now without a schema migration.
   */
  reconnect?: {
    /** Static reconnect delay in ms. Default 5000 (matches prior behaviour). */
    initialDelayMs?: number;
    /** Reserved for exp-backoff implementation. Currently ignored. */
    maxDelayMs?: number;
    /** Reserved for exp-backoff implementation. Currently ignored. */
    jitter?: 'full' | 'equal' | 'none';
    /** Reserved for exp-backoff implementation. Currently ignored. */
    maxAttempts?: number;
  };
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
 * WebSocket Provider Configuration
 */
export interface WebSocketProviderConfig {
  providerType: 'websocket';
  url: string;
  protocol?: string;
  messageFormat: 'json' | 'binary' | 'text';
  heartbeatInterval?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  /** Message to send after connection to begin data subscription. */
  subscribeMessage?: string;
}

/**
 * Socket.IO Provider Configuration
 */
export interface SocketIOProviderConfig {
  providerType: 'socketio';
  url: string;
  namespace?: string;
  events: {
    snapshot: string;
    update: string;
    delete?: string;
  };
  rooms?: string[];
  auth?: any;
  reconnection?: boolean;
  reconnectionDelay?: number;
  /** Simplified single-event name alternative to the `events` object. */
  eventName?: string;
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
  /**
   * Snapshot size. `positions` draws that many *distinct* securities from
   * the shared mock universe (50 archetypes, grown on demand with unique
   * CUSIPs up to 20 000; beyond that it cycles with a rotating account
   * index). `trades` seeds that many unique `tradeId`s (default 200); the
   * live book is capped at `max(5000, rowCount)`.
   */
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
 * AppData Variable
 */
export interface AppDataVariable {
  key: string;
  value: string | number | boolean | object;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  sensitive?: boolean;
  /**
   * Durability of this key:
   *   'volatile'  — in-memory only, lost on worker restart (default).
   *                 Auth tokens, transient selections, rate-limited
   *                 caches, anything sensitive that shouldn't leak
   *                 across sessions.
   *   'persisted' — written through to ConfigService on every `put`
   *                 and rehydrated from ConfigService when the
   *                 AppData provider configures. User preferences,
   *                 long-lived feature flags, anything the user
   *                 expects to survive a reboot.
   *
   * Defaults to 'volatile' for back-compat. Existing configs without
   * this field behave as today.
   */
  durability?: 'volatile' | 'persisted';
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
  | RestProviderConfig
  | WebSocketProviderConfig
  | SocketIOProviderConfig
  | MockProviderConfig
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
  rest: {
    providerType: 'rest',
    baseUrl: '',
    endpoint: '',
    method: 'GET',
    pollInterval: 5000,
    pageSize: 100,
    timeout: 30000
  },
  websocket: {
    providerType: 'websocket',
    url: '',
    messageFormat: 'json',
    heartbeatInterval: 30000,
    reconnectAttempts: 5,
    reconnectDelay: 5000
  },
  socketio: {
    providerType: 'socketio',
    url: '',
    namespace: '/',
    reconnection: true,
    reconnectionDelay: 5000
  },
  mock: {
    providerType: 'mock',
    dataType: 'positions',
    updateInterval: 2000,
    rowCount: 20,
    enableUpdates: true
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

  switch (config.providerType) {
    case 'stomp': {
      const stompConfig = config as StompProviderConfig;
      if (stompConfig.websocketUrl && !stompConfig.websocketUrl.startsWith('ws://') && !stompConfig.websocketUrl.startsWith('wss://')) {
        warnings.push('WebSocket URL should typically start with ws:// or wss://');
      }
      if (stompConfig.snapshotTimeoutMs && stompConfig.snapshotTimeoutMs < 1000) {
        warnings.push('Snapshot timeout is very low (< 1 second)');
      }
      break;
    }
    case 'rest': {
      const restConfig = config as RestProviderConfig;
      if (restConfig.baseUrl && !restConfig.baseUrl.startsWith('http://') && !restConfig.baseUrl.startsWith('https://')) {
        warnings.push('Base URL should typically start with http:// or https://');
      }
      if (restConfig.pollInterval && restConfig.pollInterval < 1000) {
        warnings.push('Poll interval is very low (< 1 second), may cause high server load');
      }
      break;
    }
    case 'websocket': {
      const wsConfig = config as WebSocketProviderConfig;
      if (wsConfig.url && !wsConfig.url.startsWith('ws://') && !wsConfig.url.startsWith('wss://')) {
        warnings.push('URL should typically start with ws:// or wss://');
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

/**
 * Provider lifecycle status as surfaced to subscribers (hub `status`
 * events, `IDataProvider.onStatus`, grid loading overlays). Lives in
 * the foundation layer so UI packages can type against it without a
 * dependency edge on `@wellsfargo-starui/data` (which re-exports it for its
 * own consumers).
 */
export type ProviderStatus = 'loading' | 'ready' | 'error';

// ─── Row-id derivation / path accessors ───────────────────────────────
// Implemented once in `rowPath.ts` (grammar-aware: `a.b`, `legs[0].rate`,
// `["a.b"]`); re-exported here so the `./shared/dataProvider` subpath keeps
// its historical surface.

export {
  COMPOSITE_KEY_SEPARATOR,
  composeRowId,
  getPathAccessor,
  getPathSetter,
  getValueByPath,
  normalizeKeyColumns,
  __resetPathAccessorCaches,
} from './rowPath.js';
