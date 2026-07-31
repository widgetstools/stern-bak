/**
 * Worker-side barrel. Imported only by the SharedWorker entry file
 * in each app. Main-thread code should not pull this — it'd drag the
 * SharedWorkerDataServicesHub into the page bundle.
 */

export {
  SharedWorkerDataServicesHub,
  type SharedWorkerDataServicesHubOpts,
  type PortLike,
} from './SharedWorkerDataServicesHub.js';
export { WorkerAppDataStore, type AppDataListener } from './WorkerAppDataStore.js';
export { installSharedWorkerHub, type InstallOpts, type InstalledWorker } from './entry.js';
export { registerProvider, startProvider, type ProviderFactory } from '../providers/registry.js';
export { startMock, type MockProviderOpts } from '../providers/transports/mock.js';
export {
  startStomp,
  probeStomp,
  type StompOpts,
  type StompClientFactory,
  type ProbeResult as StompProbeResult,
  type ProbeOpts,
} from '../providers/transports/stomp.js';
export {
  startRest,
  probeRest,
  type RestFetchFn,
  type RestOpts,
  type ProbeResult as RestProbeResult,
} from '../providers/transports/rest.js';
export { inferFields, type InferOptions } from '../providers/inferFields.js';
export type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';
