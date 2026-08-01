import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LayoutInfo } from '@wellsfargo-starui/types/shared';
import type { WidgetContext, WidgetConfig } from '@wellsfargo-starui/core/widget';
import { useWidgetHost } from '../providers/WidgetHost.js';
import {
  getLayouts as layoutsGet,
  saveLayout as layoutsSave,
  loadLayout as layoutsLoad,
  deleteLayout as layoutsDelete,
} from '@wellsfargo-starui/core/widget';

/**
 * useWidget(configId) — the main hook for all widget components.
 * Fetches config, manages layouts, wires lifecycle, and exposes platform communication.
 */
export function useWidget(configId: string): WidgetContext {
  const { platform, configManager, userId } = useWidgetHost();
  const queryClient = useQueryClient();

  const instanceId = useMemo(() => platform.getInstanceId(), [platform]);
  const launchData = useMemo(() => platform.getLaunchData(), [platform]);

  // ─── Config Query ──────────────────────────────────
  const {
    data: config,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['config', configId],
    queryFn: async () => (await configManager.getConfig(configId)) ?? null,
    enabled: !!configId
  });

  // ─── Layouts ───────────────────────────────────────
  const {
    data: layouts = []
  } = useQuery({
    queryKey: ['layouts', configId],
    queryFn: () => layoutsGet(configManager, configId),
    enabled: !!configId
  });

  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);

  const activeLayout = useMemo(
    () => layouts.find(l => l.id === activeLayoutId) || null,
    [layouts, activeLayoutId]
  );

  // ─── Lifecycle handlers ────────────────────────────
  const saveHandlersRef = useRef<Array<() => Promise<void> | void>>([]);
  const destroyHandlersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const unsubSave = platform.onPlatformSave(async () => {
      for (const handler of saveHandlersRef.current) {
        await handler();
      }
    });

    const unsubDestroy = platform.onPlatformDestroy(() => {
      for (const handler of destroyHandlersRef.current) {
        handler();
      }
    });

    return () => {
      unsubSave();
      unsubDestroy();
    };
  }, [platform]);

  // ─── Config Operations ─────────────────────────────
  const updateConfig = useCallback(async (updates: Partial<WidgetConfig>) => {
    await configManager.updateConfig(configId, updates);
    queryClient.invalidateQueries({ queryKey: ['config', configId] });
  }, [configId, configManager, queryClient]);

  const saveConfig = useCallback(async (fullConfig?: WidgetConfig) => {
    if (fullConfig) {
      await configManager.updateConfig(configId, fullConfig);
    } else if (config) {
      await configManager.updateConfig(configId, config);
    }
    queryClient.invalidateQueries({ queryKey: ['config', configId] });
  }, [configId, config, configManager, queryClient]);

  const refetchConfig = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // ─── Layout Operations ─────────────────────────────
  const saveLayout = useCallback(async (name: string, state: unknown): Promise<LayoutInfo> => {
    const layout = await layoutsSave(configManager, configId, name, state, userId, config?.appId || 'default-app');
    queryClient.invalidateQueries({ queryKey: ['layouts', configId] });
    return layout;
  }, [configId, userId, config, configManager, queryClient]);

  const loadLayout = useCallback(async (layoutId: string): Promise<unknown> => {
    const state = await layoutsLoad(configManager, layoutId);
    setActiveLayoutId(layoutId);
    return state;
  }, [configManager]);

  const deleteLayout = useCallback(async (layoutId: string) => {
    await layoutsDelete(configManager, layoutId);
    if (activeLayoutId === layoutId) {
      setActiveLayoutId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['layouts', configId] });
  }, [configId, activeLayoutId, configManager, queryClient]);

  const setActiveLayout = useCallback((layoutId: string) => {
    setActiveLayoutId(layoutId);
  }, []);

  // ─── Lifecycle ─────────────────────────────────────
  // Both return an unsubscribe so callers can release the handler when their
  // effect tears down — without this, a useEffect that re-runs on every prop
  // change appends a fresh closure every time and leaks for the lifetime of
  // the widget.
  const onSave = useCallback((handler: () => Promise<void> | void) => {
    saveHandlersRef.current.push(handler);
    return () => {
      saveHandlersRef.current = saveHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  const onDestroy = useCallback((handler: () => void) => {
    destroyHandlersRef.current.push(handler);
    return () => {
      destroyHandlersRef.current = destroyHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  // ─── Communication ─────────────────────────────────
  const open = useCallback(async (widgetType: string, data?: Record<string, unknown>) => {
    await platform.openWidget(widgetType, data);
  }, [platform]);

  const broadcast = useCallback((topic: string, data: unknown) => {
    platform.broadcast(topic, data);
  }, [platform]);

  const subscribe = useCallback((topic: string, handler: (data: unknown) => void) => {
    return platform.subscribe(topic, handler);
  }, [platform]);

  // ─── Settings ──────────────────────────────────────
  const openSettings = useCallback(async (screenId: string, data?: Record<string, unknown>) => {
    await platform.openSettingsScreen(screenId, {
      configId,
      instanceId,
      viewId: instanceId
    }, data);
  }, [platform, configId, instanceId]);

  return {
    id: instanceId,
    configId,
    isOpenFin: platform.isOpenFin,

    config: config || null,
    isLoading,
    error: error as Error | null,
    updateConfig,
    saveConfig,
    refetchConfig,

    layouts,
    activeLayout,
    saveLayout,
    loadLayout,
    deleteLayout,
    setActiveLayout,

    onSave,
    onDestroy,

    open,
    broadcast,
    subscribe,
    launchData,

    openSettings,
    platform
  };
}
