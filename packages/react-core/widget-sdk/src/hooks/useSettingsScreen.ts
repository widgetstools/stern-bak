import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsScreenContext } from '@wellsfargo-starui/core/widget';
import type { WidgetConfig } from '@wellsfargo-starui/core/widget';
import { useWidgetHost } from '../providers/WidgetHost.js';

/**
 * useSettingsScreen() — hook for config screen components.
 * Reads parent identity from URL search params, loads parent config,
 * and provides save/close operations.
 */
export function useSettingsScreen(): SettingsScreenContext {
  const { configManager, platform, userId: _userId } = useWidgetHost();
  const queryClient = useQueryClient();

  // Parse parent identity from URL
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const parentConfigId = params.get('parentConfigId') || '';
  const parentInstanceId = params.get('parentInstanceId') || '';
  const parentViewId = params.get('parentViewId') || '';

  // Parse launch data
  const launchData = useMemo(() => {
    try {
      const dataParam = params.get('data');
      if (dataParam) return JSON.parse(atob(dataParam));
    } catch {
      // Invalid data
    }
    return null;
  }, [params]);

  // Load parent config
  const {
    data: config,
    isLoading,
    error
  } = useQuery({
    queryKey: ['config', parentConfigId],
    queryFn: async () => (await configManager.getConfig(parentConfigId)) ?? null,
    enabled: !!parentConfigId
  });

  const saveConfig = useCallback(async (updates: Partial<WidgetConfig>) => {
    await configManager.updateConfig(parentConfigId, updates);
    queryClient.invalidateQueries({ queryKey: ['config', parentConfigId] });

    // Notify parent via broadcast
    platform.broadcast('settings-saved', {
      parentConfigId,
      parentInstanceId,
      updates
    });
  }, [parentConfigId, parentInstanceId, configManager, queryClient, platform]);

  const close = useCallback((result?: unknown) => {
    // Send result back to parent via BroadcastChannel
    platform.broadcast('settings-result', {
      type: 'settings-result',
      targetId: parentInstanceId,
      result
    });

    // Close the window
    window.close();
  }, [parentInstanceId, platform]);

  return {
    parentConfigId,
    parentInstanceId,
    parentViewId,

    config: config || null,
    isLoading,
    error: error as Error | null,

    saveConfig,
    close,
    launchData,
  };
}
