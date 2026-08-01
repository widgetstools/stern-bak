/**
 * Legacy bootstrap provider — prefer {@link DataHubProvider} for new apps.
 */

import {
  createContext,
  use,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { SharedWorkerDataServicesClient } from '@wellsfargo-starui/data/runtime/client';
import {
  AppDataMirror,
  DataProviderConfigStore,
  type DataServices,
} from '@wellsfargo-starui/data/runtime';
import { DEV_PLATFORM_BOOTSTRAP } from '@wellsfargo-starui/data';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

function readConfigManagerAppId(configManager: ConfigManager | undefined): string | undefined {
  if (!configManager || typeof configManager.getAppId !== 'function') return undefined;
  return configManager.getAppId();
}

function readConfigManagerUserId(configManager: ConfigManager | undefined): string | undefined {
  if (!configManager || typeof configManager.getIdentity !== 'function') return undefined;
  return configManager.getIdentity().userId;
}

export interface ContextValue {
  client: SharedWorkerDataServicesClient;
  appData: AppDataMirror;
  configStore: DataProviderConfigStore;
}

const DataServicesContext = createContext<ContextValue | null>(null);
const DataServicesUserIdContext = createContext<string | null>(null);
const PlatformAppIdContext = createContext<string | null>(null);

export interface PlatformIdentity {
  appId: string;
  userId: string;
}

export interface DataServicesProviderProps {
  /** Bootstrap result from `bootstrapDataServices(...)`. */
  services: DataServices;
  /**
   * Hydration mode for the AppData mirror.
   *   - `'lazy'` (default): render immediately. Components see
   *     `useAppDataStore().loaded === false` on first paint;
   *     templates resolve once the mirror snapshot arrives.
   *   - `'eager'`: suspend until `services.ready` resolves. Wrap
   *     this Provider in a `<Suspense fallback>` boundary to control
   *     the loading UI.
   */
  mode?: 'eager' | 'lazy';
  /** Session user id for AppData ownership and provider list scope. */
  userId?: string;
  /** Deployment app id — defaults to `services.configManager.getAppId()`. */
  appId?: string;
  children?: ReactNode;
}

export function DataServicesProvider({
  services,
  mode = 'lazy',
  userId,
  appId,
  children,
}: DataServicesProviderProps): ReactNode {
  if (mode === 'eager') use(services.ready);

  const effectiveUserId = userId ?? LOGGED_IN_USER_ID;
  const effectiveAppId = appId ?? readConfigManagerAppId(services.configManager) ?? DEV_PLATFORM_BOOTSTRAP.appId;

  const value = useMemo<ContextValue>(() => ({
    client: services.client,
    appData: services.appData,
    configStore: new DataProviderConfigStore(
      services.configManager,
      (providerId) => services.client.invalidateConfig(providerId),
    ),
  }), [services]);

  return (
    <DataServicesContext.Provider value={value}>
      <PlatformAppIdContext.Provider value={effectiveAppId}>
        <DataServicesUserIdContext.Provider value={effectiveUserId}>
          {children}
        </DataServicesUserIdContext.Provider>
      </PlatformAppIdContext.Provider>
    </DataServicesContext.Provider>
  );
}

export function useDataServicesContext(): ContextValue {
  const ctx = useContext(DataServicesContext);
  if (!ctx) {
    throw new Error(
      'useDataServices requires <DataServicesProvider> or <DataHubProvider>',
    );
  }
  return ctx;
}

export function useUserIdFromContext(): string {
  const ctx = useContext(DataServicesUserIdContext);
  if (ctx === null) {
    throw new Error(
      'useDataProvidersList requires <DataServicesProvider> or <DataHubProvider>',
    );
  }
  return ctx;
}

/** Platform bootstrap identity when inside {@link DataServicesProvider} / {@link DataHubProvider}. */
export function usePlatformIdentityOrNull(): PlatformIdentity | null {
  const appId = useContext(PlatformAppIdContext);
  const userId = useContext(DataServicesUserIdContext);
  if (appId === null || userId === null) return null;
  return { appId, userId };
}
