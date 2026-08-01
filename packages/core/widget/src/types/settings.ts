import type { WidgetConfig } from './widget.js';

/**
 * SettingsScreenContext — parent config access from a settings screen (framework-agnostic shape).
 */
export interface SettingsScreenContext {
  parentConfigId: string;
  parentInstanceId: string;
  parentViewId: string;

  config: WidgetConfig | null;
  isLoading: boolean;
  error: Error | null;

  saveConfig: (updates: Partial<WidgetConfig>) => Promise<void>;
  close: (result?: unknown) => void;

  launchData: Record<string, unknown> | null;
}

/**
 * SettingsScreenDefinition — metadata for a registered settings screen (no UI binding).
 */
export interface SettingsScreenDefinition {
  id: string;
  label: string;
  route: string;
}
