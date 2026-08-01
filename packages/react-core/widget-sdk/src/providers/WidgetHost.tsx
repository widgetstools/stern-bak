import { createContext, useContext, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfigManager, type ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { PlatformAdapter } from '@wellsfargo-starui/core/widget';
import type { WidgetHostProps } from '../types/widgetHost.js';
import { WidgetRegistry } from '../registry/WidgetRegistry.js';
import { BrowserAdapter } from '@wellsfargo-starui/core/widget/browser';

export interface WidgetHostContextValue {
  apiUrl: string;
  userId: string;
  platform: PlatformAdapter;
  registry: WidgetRegistry;
  configManager: ConfigManager;
}

const WidgetHostContext = createContext<WidgetHostContextValue | null>(null);

export function useWidgetHost(): WidgetHostContextValue {
  const ctx = useContext(WidgetHostContext);
  if (!ctx) {
    throw new Error('useWidgetHost must be used within a <WidgetHost> provider');
  }
  return ctx;
}

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * WidgetHost — top-level provider that supplies platform adapter, config
 * manager, widget registry, and React Query to all widgets in the tree.
 *
 * `apiUrl` is forwarded to the config manager as its REST base URL when
 * non-empty; when empty, the manager runs in local Dexie-only mode.
 */
export function WidgetHost({
  apiUrl,
  userId,
  platform,
  registry,
  children,
}: WidgetHostProps) {
  const value = useMemo<WidgetHostContextValue>(() => {
    const configManager = createConfigManager({
      configServiceRestUrl: apiUrl && apiUrl.trim().length > 0 ? apiUrl : undefined,
    });
    return {
      apiUrl,
      userId,
      platform: platform || new BrowserAdapter(apiUrl),
      registry: registry || new WidgetRegistry(),
      configManager,
    };
  }, [apiUrl, userId, platform, registry]);

  // Lazy init + dispose on unmount so background seed loading / REST
  // sync loops (if any) tear down with the provider.
  useEffect(() => {
    let disposed = false;
    value.configManager.init().catch((err) => {
      if (!disposed) console.error('ConfigManager init failed', err);
    });
    return () => {
      disposed = true;
      value.configManager.dispose();
    };
  }, [value.configManager]);

  return (
    <QueryClientProvider client={defaultQueryClient}>
      <WidgetHostContext.Provider value={value}>
        {children}
      </WidgetHostContext.Provider>
    </QueryClientProvider>
  );
}
