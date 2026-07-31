import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import { isCatalogConfigRow } from './isCatalogConfigRow.js';

/**
 * Keep the SharedWorker catalog cache aligned with IndexedDB writes.
 *
 * Only `data-provider` and `appdata` rows trigger worker invalidation.
 * Grid profile / dock / registry saves are ignored so opening another
 * MarketsGrid window does not broadcast `catalog-ready` to every port.
 */
export function wireWorkerCatalogSync(
  configManager: ConfigManager,
  client: SharedWorkerDataServicesClient,
): () => void {
  return configManager.onConfigChanged((configId) => {
    void (async () => {
      const row = await configManager.getConfig(configId);
      if (!row || !isCatalogConfigRow(row)) return;
      await client.invalidateConfig(configId);
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[host-data] worker catalog invalidate failed', err);
    });
  });
}
