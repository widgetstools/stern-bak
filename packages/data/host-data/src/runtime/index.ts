/**
 * Runtime public surface (in-package). The streaming, SharedWorker-
 * backed runtime that powers live data delivery. One-shot probes
 * (`probeStomp`, `probeRest`, `inferFields`) live next to the
 * streaming transports in `./providers/` and surface from the package
 * root for editor / field-inference flows that don't need the worker.
 *
 * Subpaths:
 *   `@wellsfargo-starui/data/runtime`               — main thread (client + protocol types)
 *   `@wellsfargo-starui/data/runtime/sharedWorker`  — SharedWorker entry + SharedWorkerDataServicesHub
 *   `@wellsfargo-starui/data/runtime/client`        — SharedWorkerDataServicesClient
 */

export type {
  ProviderStats,
  ProviderStatus,
  HubIntrospectSnapshot,
  HubProviderIntrospectRow,
  HubAppDataIntrospectRow,
  AttachRequest,
  DetachRequest,
  StopRequest,
  Request,
  DeltaEvent,
  DeltaBinEvent,
  DeltaPatchEvent,
  SubInitEvent,
  RowPatch,
  WireEncoding,
  StatusEvent,
  StatsEvent,
  Event,
  AppDataRow,
  AppDataAttachRequest,
  AppDataDetachRequest,
  AppDataSetRequest,
  AppDataUpsertRequest,
  AppDataRemoveRequest,
  AppDataRequest,
  AppDataSnapshotEvent,
  AppDataDeltaEvent,
  AppDataAckEvent,
  AppDataEvent,
  CatalogChangeDetail,
  CatalogReadyEvent,
} from './protocol.js';
export { isRequest, isEvent, isAppDataRequest, isAppDataEvent } from './protocol.js';

// Wire codecs — typed-array columnar frames + thin-delta row diffing.
export { tryEncodeColumnar, decodeColumnar } from './wire/columnarCodec.js';
export { diffTopLevel, type TopLevelDiff } from './wire/rowDiff.js';

// Template substitution (client-side, before attach).
export {
  resolveTemplate,
  resolveCfg,
  collectTemplateRefs,
  findUnresolvedAppDataTokens,
  assertAppDataResolved,
  type AppDataLookup,
} from './template/resolver.js';
export {
  traceStompProviderCfg,
  traceStompWireDestinations,
  traceWorkerAppDataSnapshot,
  isTemplateTraceForced,
} from './template/templateTrace.js';

// Persistence helpers — main-thread, ConfigManager-backed.
export {
  DataProviderConfigStore,
  PUBLIC_USER_ID,
  COMPONENT_TYPE_DATA_PROVIDER,
  type CatalogInvalidateFn,
  type ListOptions,
} from './config/store.js';
export {
  AppDataConfigStore,
  COMPONENT_TYPE_APPDATA,
  type AppDataConfig,
} from './providers/appdata/index.js';

// AppData mirror — the main-thread surface. Sync read + async write
// proxy backed by the SharedWorkerDataServicesHub.
export { AppDataMirror, type AppDataMirrorOpts } from './mirror/AppDataMirror.js';

// Bootstrap — single entry point that wraps a SharedWorker into the
// `DataServices` bundle (client + mirror + ConfigManager + ready).
// Idempotent by `appName`.
export {
  bootstrapDataServices,
  type BootstrapDataServicesOpts,
  type DataServices,
  createDataServicesClient,
  type CreateDataServicesClientOpts,
  createDataServicesWorker,
  DATA_SERVICES_WORKER_ASSET,
  type CreateDataServicesWorkerOpts,
  bootstrapDataServicesWithWorkerAsset,
  type BootstrapDataServicesWithWorkerAssetOpts,
} from './bootstrap/index.js';

// Client — SharedWorker MessagePort wrapper. Most consumers reach the
// client via `bootstrapDataServices(...).client`; the type is
// re-exported here so adapters (data-services-react, data-services-angular)
// can reference it without the deep subpath import.
export {
  SharedWorkerDataServicesClient,
  type DataListener,
  type StatsListener,
  type AttachOpts,
  type SubId,
  type SubscribeHandle,
  type SharedWorkerDataServicesClientOpts,
} from './client/SharedWorkerDataServicesClient.js';

// SSRM query plane — types + helpers for server-side row model grids.
export {
  SsrmPlane,
  type Row,
  type EnrichedRow,
  type ExpressionRule,
  type SsrmGetRowsRequest,
  type SsrmGetRowsResult,
  type SetFilterValuesRequest,
  type TickEvent,
  type StatusBarRequest,
  type StatusBarSummary,
  type StatusBarAggSpec,
  parseQuickFilter,
  buildQuickFilterText,
  rowPassesQuickFilter,
  rowPassesFilter,
  resolveSsrmKeyColumn,
  isSsrmProviderType,
} from './ssrm/index.js';
