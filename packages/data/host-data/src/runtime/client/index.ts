/**
 * Client barrel — main-thread surface. Lives outside the runtime root
 * so apps that don't bundle the worker types still get a clean import.
 *
 * Subpath export: `@wellsfargo-starui/data/runtime/client`.
 */

export {
  SharedWorkerDataServicesClient,
  createInPageWiring,
  type DataListener,
  type StatsListener,
  type AttachOpts,
  type SharedWorkerDataServicesClientOpts,
  type SubId,
  type InPageWiring,
  type PerspectiveAttachOutcome,
} from './SharedWorkerDataServicesClient.js';
