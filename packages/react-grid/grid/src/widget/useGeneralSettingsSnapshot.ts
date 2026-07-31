import { useCallback, useSyncExternalStore } from 'react';
import type { GeneralSettingsState } from '@wellsfargo-starui/engine';
import type { GridPlatform } from '@wellsfargo-starui/engine';
import { GENERAL_SETTINGS_MODULE_ID } from '../customizer/modules/general-settings';

/** Subscribe to the general-settings module slice for reactive toolbar / theme reads. */
export function useGeneralSettingsSnapshot(
  platform: GridPlatform | null | undefined,
): GeneralSettingsState | undefined {
  const store = platform?.store;
  const subscribe = useCallback(
    (onChange: () => void) =>
      typeof store?.subscribeToModule === 'function'
        ? store.subscribeToModule<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID, onChange)
        : () => {},
    [store],
  );
  const getSnapshot = useCallback(() => {
    if (typeof store?.getModuleState !== 'function') return undefined;
    return store.getModuleState<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID);
  }, [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
