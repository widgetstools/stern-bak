/**
 * Barrel — `bootstrapDataServices` + `DataServices` type.
 *
 * Subpath consumers:
 *   `import { bootstrapDataServices } from '@wellsfargo-starui/data'`     ← preferred
 *   `import { bootstrapDataServices } from '@wellsfargo-starui/data/runtime'`
 */

export {
  bootstrapDataServices,
  type BootstrapDataServicesOpts,
  type DataServices,
} from './bootstrap.js';

export {
  createDataServicesClient,
  type CreateDataServicesClientOpts,
} from './createDataServicesClient.js';

export {
  createDataServicesWorker,
  DATA_SERVICES_WORKER_ASSET,
  DATA_SERVICES_PERSPECTIVE_WORKER_ASSET,
  type CreateDataServicesWorkerOpts,
} from './createDataServicesWorker.js';

export {
  bootstrapDataServicesWithWorkerAsset,
  type BootstrapDataServicesWithWorkerAssetOpts,
} from './bootstrapWithWorkerAsset.js';
