// @wellsfargo-starui/react/widget-sdk — React bindings for the Star Widget Framework

export type {
  WidgetConfig,
  WidgetProps,
  WidgetContext,
  PlatformAdapter,
  ParentIdentity,
  SettingsScreenContext,
  ActionContext,
} from '@wellsfargo-starui/widget';

export type { SettingsScreenDefinition } from './types/settings.js';

export type {
  SlotContent,
  WidgetEnhancer,
  WidgetExtensionConfig,
} from './types/slots.js';

export type { WidgetHostProps } from './types/widgetHost.js';

export { WidgetRegistry } from './registry/WidgetRegistry.js';
export { WidgetHost, useWidgetHost } from './providers/WidgetHost.js';
export { useWidget } from './hooks/useWidget.js';
export { useSettingsScreen } from './hooks/useSettingsScreen.js';

export { BrowserAdapter } from '@wellsfargo-starui/widget-browser';
export {
  getLayouts,
  saveLayout,
  loadLayout,
  deleteLayout,
} from '@wellsfargo-starui/widget';

export { createConfigManager } from '@wellsfargo-starui/host-config';
export type {
  ConfigManager,
  ConfigManagerOptions,
} from '@wellsfargo-starui/host-config';

export { renderSlot } from './extensibility/renderSlot.js';
export { createExtendedWidget } from './extensibility/createExtendedWidget.js';
export { compose } from './extensibility/compose.js';
