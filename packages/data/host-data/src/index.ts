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
  ISsrmDataProvider,
  SsrmTickPayload,
  SsrmProviderClientAdapterOpts,
} from './provider/index.js';
export {
  ProviderClientAdapter,
  resolveProviderCapabilities,
  SsrmProviderClientAdapter,
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
  createFiPositionsLargeConfig,
  createFiPositionsSmallConfig,
  inferFields,
  type StompProbeResult,
  type StompProbeOpts,
  type RestProbeResult,
  type InferOptions,
  type MockProviderOpts,
  type FiPositionsConfigOverrides,
} from './runtime/providers/index.js';

export {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './services/index.js';

export { createDataPort } from './createDataPort.js';
