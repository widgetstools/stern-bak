import type { SettingsScreenDefinition as BaseSettingsScreenDefinition } from '@wellsfargo-starui/core/widget';

/**
 * React settings screen registration — optional component binding.
 */
export interface SettingsScreenDefinition extends BaseSettingsScreenDefinition {
  component?: React.ComponentType;
}

export type { SettingsScreenContext } from '@wellsfargo-starui/core/widget';
