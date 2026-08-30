import { createConfigManager, type ConfigManager } from '@wellsfargo-starui/core/host/config';
import { bootstrapDataServices, type DataServices } from './bootstrap.js';
import {
  createDataServicesWorker,
  type CreateDataServicesWorkerOpts,
} from './createDataServicesWorker.js';

export interface BootstrapDataServicesWithWorkerAssetOpts
  extends CreateDataServicesWorkerOpts {
  userId: string;
  mainThreadConfigManager?: ConfigManager;
  /** `@wellsfargo-starui/data/assets/data-provider-worker.js?url` — enables `dataPlane: 'subworker'` providers. */
  providerWorkerScriptUrl?: string;
}

/**
 * One-call bootstrap when the app supplies the bundled worker URL from
 * Vite's `?url` import. Keeps `new SharedWorker(...)` out of library
 * code while avoiding a hand-written app-local worker entry file.
 *
 * @deprecated Prefer {@link ensurePlatformReady} or {@link ensureDataServicesHub}
 * for new apps — they wait for catalog preload and expose the hub bundle API.
 */
export function bootstrapDataServicesWithWorkerAsset(
  workerScriptUrl: string | undefined,
  opts: BootstrapDataServicesWithWorkerAssetOpts,
): DataServices {
  const worker = createDataServicesWorker(workerScriptUrl, opts);

  const configManager =
    opts.mainThreadConfigManager ??
    createConfigManager({ configServiceRestUrl: opts.configServiceRestUrl });

  return bootstrapDataServices({
    appName: opts.appName,
    worker,
    configManager,
    userId: opts.userId,
    providerWorkerUrl: opts.providerWorkerScriptUrl,
  });
}
