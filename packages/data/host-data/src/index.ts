/**
 * @wellsfargo-starui/data — public entry.
 *
 * The runtime is the live surface. The root entry re-exports runtime
 * types so `@wellsfargo-starui/data` continues to give consumers a
 * usable barrel. For specific entry points use the subpath exports:
 *
 *   `@wellsfargo-starui/data/runtime`               — protocol types + main-thread helpers
 *   `@wellsfargo-starui/data/runtime/client`        — the SharedWorkerDataServicesClient
 *   `@wellsfargo-starui/data/runtime/sharedWorker`  — installSharedWorkerHub + SharedWorkerDataServicesHub
 *
 * `probeStomp` / `probeRest` / `inferFields` are pure main-thread
 * helpers (the design doc's `transport: 'main'` mode) consumed by
 * editors for "Test connection" and "Infer fields" flows.
 */

// Runtime surface — main-thread types + helpers.
export * from './runtime/index.js';

// IDataProvider contract (Phase 0 types; adapter in Phase 3).
export type {
  DataServicesHubBundle,
  IDataProvider,
  IDataProviderFactory,
  ProviderCapabilities,
  Unsubscribe,
  ProviderClientAdapterOpts,
} from './provider/index.js';
export {
  ProviderClientAdapter,
  resolveProviderCapabilities,
} from './provider/index.js';

// Platform bootstrap (Phase 0.5).
export type {
  PlatformBootstrapConfig,
  PlatformBootstrapValidationResult,
  AppDataBootstrapManifest,
} from './bootstrap/index.js';
export {
  DEV_PLATFORM_BOOTSTRAP,
  validatePlatformBootstrapConfig,
  PlatformBootstrapConfigError,
  resolvePlatformBootstrapFromJson,
  resolvePlatformBootstrapFromObject,
  ensureConfigReady,
  ensurePlatformReady,
  ensureDataServicesHub,
  SnapshotReassembler,
  runAppDataBootstrap,
  createAppDataBootstrapContext,
  markConfigReady,
  markHubConnected,
  markAppDataReady,
  markCatalogReady,
  markPlatformReady,
  markLoadMilestone,
  readLoadMilestone,
  readLoadTimings,
} from './bootstrap/index.js';
export type { LoadMilestone } from './bootstrap/index.js';
export type {
  FetchLike,
  ConfigReadyBundle,
  EnsurePlatformReadyOpts,
  EnsureHubOpts,
  ResolvedDataServicesHubBundle,
  SnapshotReassemblerCallbacks,
  AppDataBootstrapContext,
  AppDataBootstrapHook,
  AppDataBootstrapHookRegistry,
  AppDataUpsertInput,
  RunAppDataBootstrapOpts,
} from './bootstrap/index.js';

// One-shot probes — pure main-thread functions for editor flows
// (Test connection, Infer fields). Same vocabulary the streaming
// runtime uses; calling them in-process is the design doc's
// `transport: 'main'` mode.
export {
  probeStomp,
  connectStomp,
  probeRest,
  probeMock,
  startMock,
  // The described mock catalogue — datasets, grouped fields, and the curated
  // default blotter layout. Inference says what fields exist; this says which
  // ones matter and what a new blotter should open with.
  MOCK_DATASETS,
  mockDataset,
  mockFieldGroups,
  curatedColumns,
  allCatalogColumns,
  columnsForFields,
  createFiPositionsLargeConfig,
  createFiPositionsSmallConfig,
  inferFields,
  collectFieldPaths,
  collectProjectionPaths,
  createFieldProjector,
  compileFlattenPlan,
  flattenRow,
  flattenJsonText,
  type FieldProjector,
  type FlattenPlan,
  type FlattenNode,
  type StompProbeResult,
  type StompProbeOpts,
  type RestProbeResult,
  type InferOptions,
  type MockProviderOpts,
  type MockDataType,
  type MockFieldSpec,
  type MockDatasetSpec,
  type FiPositionsConfigOverrides,
} from './runtime/providers/index.js';

export {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './services/index.js';

export { createDataPort } from './createDataPort.js';

// Pure row-analytics — digest/highlights, chart-spec picking, the
// filter/group/pivot query engine, and heatmap cell shading. Shared between
// the AI Assistant (apps/source/star-demo) and the grid package's
// summary-panel customizer module.
export * from './analytics/index.js';
