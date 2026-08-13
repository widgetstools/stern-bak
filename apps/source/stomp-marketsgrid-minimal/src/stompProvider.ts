/**
 * STOMP provider definition — written to IndexedDB by App.configStore.save().
 *
 * This is the catalog payload (transport cfg + columns). The worker reads it
 * from ConfigCatalogCache on attach; the grid never receives cfg inline.
 */

import type {
  DataProviderConfig,
  StompProviderConfig,
  StompSsrmProviderConfig,
} from '@wellsfargo-starui/types';

/** Must match a tag published by stomp-view-server (`npm run dev` there). */
const TAG = 'TRADER001';

// ─── Live wire destinations ──────────────────────────────────────────
// Live snapshot + realtime tail. No date token — the broker streams the
// current book and keeps pushing deltas.
const liveListenerTopic = `/snapshot/positions/${TAG}`;
const liveRequestMessage = `/snapshot/positions/${TAG}/1000/50`;

// ─── Historical wire destinations (HOW HISTORICAL DATA IS FETCHED) ────
// These carry the `{{positions.asOfDate}}` template token. The date is
// NOT known when this config is authored — it is filled in at runtime
// from the toolbar date picker. End-to-end flow:
//
//   1. User picks a PAST date in the grid's toolbar date picker
//      (ToolbarDatePicker → MarketsGrid.onToolbarDateChange).
//   2. MarketsGridContainer.handleToolbarDateChange sees it's a past
//      date, switches the active provider from the LIVE id to the
//      HISTORICAL id (defaultHistoricalProviderId, see App.tsx), writes
//      the date into AppData under `historicalDateAppDataRef`
//      (= "positions.asOfDate", see App.tsx), and schedules a reload.
//   3. reloadFromSource() restarts the historical provider with the
//      overlay `{ asOfDate: '<picked date>' }`.
//   4. In the worker, the STOMP provider (startStomp) takes that
//      restart overlay and, on reconnect, substitutes the token in the
//      destinations below — `{{positions.asOfDate}}` → the picked date
//      (host-data/.../transports/stomp.ts: resolveStompDestinations +
//      lookupWithRestartOverlay, and mergeOverlay injects `asOfDate`
//      into the trigger body). The overlay date wins over any AppData
//      value, so the reload is deterministic.
//   5. The broker receives a date-specific snapshot path/trigger and
//      replies with that day's positions (snapshot only — no live tail).
//
// So: changing the picker date == swapping the value substituted into
// these two strings, then re-subscribing.
const historicalListenerTopic = `/snapshot/positions/${TAG}/{{positions.asOfDate}}`;
/** Historical trigger: /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}] — not live rate/batch. */
const historicalRequestMessage = `/snapshot/positions/${TAG}/{{positions.asOfDate}}/50`;

/** Bump when STOMP wire destinations or cfg change so App re-persists catalog rows on load. */
export const STOMP_PROVIDER_CFG_VERSION = 5;

// ─── Deterministic catalog ids ───────────────────────────────────────
// Stable, app-namespaced provider ids. Because configStore.save() upserts
// by providerId (`provider.providerId ?? generateProviderId()`), giving the
// seed drafts a fixed id makes seeding IDEMPOTENT: two concurrent saves —
// e.g. React StrictMode's double-invoked effect, which previously listed an
// empty catalog twice and minted two random-id rows each — now write the
// SAME row instead of duplicating it. See App.tsx for the self-heal that
// also removes any pre-existing random-id duplicates.
export const STOMP_LIVE_PROVIDER_ID = 'stomp-marketsgrid-minimal:positions-live';
export const STOMP_HISTORICAL_PROVIDER_ID = 'stomp-marketsgrid-minimal:positions-historical';
/** SSRM catalog row — same wire as live, `providerType: 'stomp-ssrm'`. */
export const STOMP_SSRM_PROVIDER_ID = 'stomp-marketsgrid-minimal:positions-ssrm';

/** StompProviderConfig — passed to hub startStomp() after catalog resolve. */
const stompLive: StompProviderConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: liveListenerTopic,
  requestMessage: liveRequestMessage,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: false,
  // Snapshot flush frame size (rows per worker→client postMessage).
  // Smaller keeps each main-thread message under the long-task budget.
  snapshotChunkSize: 1000,
  // Live updates: coalesce ticks into a trailing-edge burst every 100ms,
  // collapsing repeated updates for the same positionId to the latest
  // before fanning out to the grid.
  throttleMs: 100,
  conflateByKey: 'positionId',
  columnDefinitions: [
    // Identifiers
    { field: 'positionId', headerName: 'Position Id', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'cusip', headerName: 'Cusip', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'ticker', headerName: 'Ticker', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'instrumentName', headerName: 'Instrument Name', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'instrumentType', headerName: 'Instrument Type', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'bookName', headerName: 'Book Name', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'portfolio', headerName: 'Portfolio', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'trader', headerName: 'Trader', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'desk', headerName: 'Desk', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'region', headerName: 'Region', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'country', headerName: 'Country', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    // Price & size
    { field: 'notionalAmount', headerName: 'Notional Amount', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'currentPrice', headerName: 'Current Price', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    // P&L
    { field: 'pnl', headerName: 'Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'unrealizedPnl', headerName: 'Unrealized Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'realizedPnl', headerName: 'Realized Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'dailyPnl', headerName: 'Daily Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'mtdPnl', headerName: 'Mtd Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'ytdPnl', headerName: 'Ytd Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    // Yield & spread
    { field: 'yield', headerName: 'Yield', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'spread', headerName: 'Spread', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    // Rate risk
    { field: 'dv01', headerName: 'Dv01', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'pv01', headerName: 'Pv01', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'cs01', headerName: 'Cs01', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    // Agency ratings (nested `rating` object → auto valueGetter for dot-paths)
    { field: 'rating.moody', headerName: 'Moody', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'rating.sp', headerName: 'Sp', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'rating.fitch', headerName: 'Fitch', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  ],
};

// The HISTORICAL provider is a SECOND, separate catalog row. It reuses
// every live setting (columns, keyColumn, conflation/throttle, chunk
// size) but swaps in the date-templated destinations above. The grid
// switches to this provider's id when a past date is picked; the date
// is injected into the tokens at restart (see the flow note above).
const stompHistorical: StompProviderConfig = {
  ...stompLive,
  listenerTopic: historicalListenerTopic,
  requestMessage: historicalRequestMessage,
};

/** DataProviderConfig row shape for configStore.save() → appConfig in Dexie. */
export const stompProviderDraft: DataProviderConfig = {
  providerId: STOMP_LIVE_PROVIDER_ID,
  name: 'STOMP Positions',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stompLive,
};

// Persisted as its own catalog row (distinct `name` → distinct
// providerId). App.tsx seeds this alongside the live one and hands its
// id to the grid as `defaultHistoricalProviderId`, which is what the
// toolbar date picker switches to for past dates.
export const stompHistoricalProviderDraft: DataProviderConfig = {
  providerId: STOMP_HISTORICAL_PROVIDER_ID,
  name: 'STOMP Positions (Historical)',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stompHistorical,
};

/** Same live wire as CSRM, but hub attaches an SSRM query plane. */
const stompSsrm: StompSsrmProviderConfig = {
  ...stompLive,
  providerType: 'stomp-ssrm',
  blockSize: 100,
};

export const stompSsrmProviderDraft: DataProviderConfig = {
  providerId: STOMP_SSRM_PROVIDER_ID,
  name: 'STOMP Positions (SSRM)',
  providerType: 'stomp-ssrm',
  userId: 'dev1',
  public: false,
  config: stompSsrm,
};
