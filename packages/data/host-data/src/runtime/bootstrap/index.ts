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
  createDataServicesWorker,
  DATA_SERVICES_WORKER_ASSET,
  type CreateDataServicesWorkerOpts,
} from './createDataServicesWorker.js';
