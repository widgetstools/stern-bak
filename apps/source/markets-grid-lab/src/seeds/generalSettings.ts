import type { GeneralSettingsState } from '@wellsfargo-starui/grid/customizer';

// Partial general-settings overrides. The hook merges these into the
// module's current state via setModuleState so we only touch the fields
// that matter for the demo. Everything else keeps the module defaults.

export const FAST_FLASH: Partial<GeneralSettingsState> = {
  cellFlashDuration: 500,
  cellFadeDuration: 1000,
};

export const HEAVY_FLASH: Partial<GeneralSettingsState> = {
  cellFlashDuration: 700,
  cellFadeDuration: 1400,
};

/** Live-updates tab — fast AG-Grid native flash + rule flashes. */
export const STORM_FLASH: Partial<GeneralSettingsState> = {
  enableCellChangeFlash: true,
  cellChangeFlashColor: 'sky',
  cellFlashDuration: 350,
  cellFadeDuration: 800,
};
