import type { DataServices } from '@wellsfargo-starui/host-data/runtime';

/** Bridge hub bundle → legacy `DataServicesProvider` shape until full hub migration. */
export function asLegacyDataServices(
  bundle: Pick<DataServices, 'client' | 'appData' | 'configManager' | 'ready' | 'dispose'>,
): DataServices {
  return {
    client: bundle.client,
    appData: bundle.appData,
    configManager: bundle.configManager,
    ready: bundle.ready,
    dispose: () => bundle.dispose(),
  };
}
