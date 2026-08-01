import {
  gridDensityStructuralParams,
  type GridDensity,
} from '@wellsfargo-starui/design-system/adapters/ag-grid';
import type { GeneralSettingsState } from '@wellsfargo-starui/core';
import type { GridPlatform } from '@wellsfargo-starui/core';
import { GENERAL_SETTINGS_MODULE_ID } from '../customizer/modules/general-settings';

function gridApi(platform: GridPlatform) {
  const api = platform.api.api;
  if (!api) return null;
  if ((api as unknown as { isDestroyed?: () => boolean }).isDestroyed?.()) return null;
  return api;
}

/**
 * Persist a density preset and push row/header heights to the live grid API
 * immediately (without waiting for the module pipeline tick). Row-height
 * animations are suppressed for the swap so density changes feel instant.
 */
export function applyGridDensityLive(platform: GridPlatform, density: GridDensity): void {
  const structural = gridDensityStructuralParams(density);

  platform.store.setModuleState<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID, (prev) => ({
    ...prev,
    gridDensity: density,
    rowHeight: structural.rowHeight,
    headerHeight: structural.headerHeight,
  }));

  const api = gridApi(platform);
  if (!api) return;

  const hadAnimate = api.getGridOption('animateRows') === true;
  if (hadAnimate) api.setGridOption('animateRows', false);
  api.setGridOption('rowHeight', structural.rowHeight);
  api.setGridOption('headerHeight', structural.headerHeight);
  if (hadAnimate) {
    queueMicrotask(() => {
      const live = gridApi(platform);
      live?.setGridOption('animateRows', true);
    });
  }
}
