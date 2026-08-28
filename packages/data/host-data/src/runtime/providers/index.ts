/**
 * Probe surface — pure main-thread functions for one-shot snapshot
 * fetches and field inference. Same vocabulary as the streaming
 * runtime; calling them in-process is the design doc's
 * `transport: 'main'` mode.
 *
 * Usage:
 *   import { probeStomp, probeRest, inferFields } from '@wellsfargo-starui/data';
 *   const r = await probeStomp(cfg, { maxRows: 100 });
 *   if (!r.ok) throw new Error(r.error);
 *   const { fields } = inferFields(r.rows!, { targetSampleSize: 100 });
 *
 * ─── Adding a new transport ─────────────────────────────────────
 *
 * 1. Declare the config interface in
 *    `@wellsfargo-starui/types/dataProvider.ts` with
 *    `providerType: '<your-id>'` and add it to the `ProviderConfig`
 *    union.
 * 2. Implement the factory in
 *    `runtime/providers/transports/<your-id>.ts` exporting
 *    `start<YourId>(cfg, emit, opts?) => ProviderHandle`.
 *    Optionally export
 *    `probe<YourId>(cfg, opts?) => Promise<ProbeResult>` for editor
 *    "Test connection" / "Infer fields" flows.
 * 3. Register the factory in `runtime/providers/registry.ts`'s
 *    `factories` map (one line).
 * 4. (Optional) Re-export `probe<YourId>` from this barrel and add
 *    it to the package root in `src/index.ts` so editor consumers
 *    can `import { probe<YourId> } from '@wellsfargo-starui/data'`.
 * 5. Update each editor's selectable-type list (React's
 *    `SUPPORTED_TYPES` in `DataProviderEditor.tsx`; Angular's
 *    `providerTypes` in `data-provider-editor.component.ts`).
 *
 * Three transports already follow this pattern: mock, stomp, rest.
 * `mock.ts` is the simplest reference (~50 LOC). The hub's
 * `SharedWorkerDataServicesHub.test.ts` has a "REST round-trip"
 * describe block — copy it to assert your new transport passes
 * through the registry + cache + broadcast machinery the same way.
 */

export { probeStomp, connectStomp } from './transports/stomp.js';
export type {
  ProbeResult as StompProbeResult,
  ProbeOpts as StompProbeOpts,
} from './transports/stomp.js';

export { probeRest } from './transports/rest.js';
export type { ProbeResult as RestProbeResult } from './transports/rest.js';

export { probeMock, startMock, type MockProviderOpts } from './transports/mock.js';

// The described catalogue — datasets, grouped fields, and the curated default
// blotter layout. Inference tells you what fields exist; this tells you which
// ones matter and what a blotter should open with.
export {
  MOCK_DATASETS,
  mockDataset,
  mockFieldGroups,
  curatedColumns,
  allCatalogColumns,
  columnsForFields,
  type MockDataType,
  type MockFieldSpec,
  type MockDatasetSpec,
} from './transports/mockCatalog.js';


export {
  createFiPositionsLargeConfig,
  createFiPositionsSmallConfig,
  type FiPositionsConfigOverrides,
} from './transports/mockPresets.js';

export { inferFields, type InferOptions } from './inferFields.js';
