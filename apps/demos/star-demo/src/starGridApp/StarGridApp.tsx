import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { BrowserRuntime } from '@wellsfargo-starui/host-browser';
import type { RuntimePort } from '@wellsfargo-starui/host';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import {
  createConfigServiceStorage,
  createConfigPort,
} from '@wellsfargo-starui/host-config';
import { buildGridHostContext, storageFactoryForPersistence } from './buildHostContext.js';
import { StarGridAppProvider } from './StarGridAppContext.js';
import type { StarGridAppOptions, StarGridAppState } from './types.js';

export interface StarGridAppProps extends StarGridAppOptions {
  readonly children: ReactNode;
}

/** Stable default — inline `[]` in destructuring is a new ref every render and retriggers bootstrap. */
const EMPTY_PLUGINS = [] as const satisfies NonNullable<StarGridAppOptions['plugins']>;

/**
 * `<StarGridApp>` — declarative root for StarGrid consumer apps.
 *
 * Collapses runtime bootstrap, optional ConfigManager wiring, and
 * per-grid `GridHostContext` assembly into one component. Children
 * read the shell via `useStarGridApp()` / `useStarGridHost({ gridId })`.
 *
 * MarketsGrid accepts `host={useStarGridHost({ gridId })}` or reads
 * the same context when the `host` prop is omitted (see grid package).
 */
export function StarGridApp({
  appId,
  userId = LOGGED_IN_USER_ID,
  instanceId,
  componentType = 'MarketsGrid',
  persistence = 'localStorage',
  runtime: runtimeProp,
  configManager: configManagerProp,
  data: dataProp,
  loading = null,
  plugins = EMPTY_PLUGINS,
  children,
}: StarGridAppProps): ReactNode {
  const [resolved, setResolved] = useState<{
    runtime: RuntimePort;
    configManager?: ConfigManager;
    data?: import('@wellsfargo-starui/host').DataPort;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const runtime =
        runtimeProp !== undefined
          ? await Promise.resolve(runtimeProp)
          : new BrowserRuntime({
              identity: {
                appId,
                userId,
                instanceId: instanceId ?? appId,
                componentType,
              },
            });

      let configManager: ConfigManager | undefined;
      if (configManagerProp !== undefined) {
        const raw = await Promise.resolve(configManagerProp);
        await raw.init();
        configManager = raw;
      }

      const data = dataProp !== undefined ? await Promise.resolve(dataProp) : undefined;

      if (!cancelled) {
        setResolved({ runtime, configManager, data });
        for (const plugin of plugins) {
          await plugin.register?.({ appId });
        }
      }
    }

    void boot().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[StarGridApp] bootstrap failed:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [appId, userId, instanceId, componentType, runtimeProp, configManagerProp, dataProp, plugins]);

  const [theme, setThemeState] = useState(resolved?.runtime.getTheme() ?? 'dark');

  useEffect(() => {
    if (!resolved) return;
    setThemeState(resolved.runtime.getTheme());
    return resolved.runtime.onThemeChanged(setThemeState);
  }, [resolved]);

  const storageFactory = useMemo(() => {
    if (!resolved) return undefined;
    const configStorageFactory =
      persistence === 'config' && resolved.configManager
        ? createConfigServiceStorage({ configManager: resolved.configManager })
        : undefined;
    return storageFactoryForPersistence(persistence, configStorageFactory);
  }, [resolved, persistence, appId, userId]);

  const appState = useMemo<StarGridAppState | null>(() => {
    if (!resolved || !storageFactory) return null;

    const configPort =
      resolved.configManager !== undefined
        ? createConfigPort({
            configManager: resolved.configManager,
            appId,
            userId,
          })
        : undefined;

    return {
      runtime: resolved.runtime,
      configManager: resolved.configManager,
      configPort,
      data: resolved.data,
      storageFactory,
      theme,
      setTheme: resolved.runtime.setTheme.bind(resolved.runtime),
      onThemeChanged: resolved.runtime.onThemeChanged.bind(resolved.runtime),
      hostForGrid: (scope) =>
        buildGridHostContext(resolved.runtime, storageFactory, scope, {
          data: resolved.data,
          config: configPort,
        }),
    };
  }, [resolved, storageFactory, appId, userId, theme]);

  if (!appState) return loading;

  return <StarGridAppProvider value={appState}>{children}</StarGridAppProvider>;
}
