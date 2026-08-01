import type { LayoutInfo, UnifiedConfig } from '@wellsfargo-starui/types/shared';
import type { PlatformAdapter } from './platform.js';

/**
 * WidgetConfig — config shape widgets consume (UnifiedConfig narrowed for widgets).
 */
export type WidgetConfig = UnifiedConfig;

/**
 * WidgetProps — base props every widget implementation receives.
 */
export interface WidgetProps {
  configId: string;
  launchData?: Record<string, unknown>;
}

/**
 * WidgetContext — runtime surface exposed to widget implementations (React hook / Angular service).
 */
export interface WidgetContext {
  id: string;
  configId: string;
  isOpenFin: boolean;

  config: WidgetConfig | null;
  isLoading: boolean;
  error: Error | null;
  updateConfig: (updates: Partial<WidgetConfig>) => Promise<void>;
  saveConfig: (config?: WidgetConfig) => Promise<void>;
  refetchConfig: () => Promise<void>;

  layouts: LayoutInfo[];
  activeLayout: LayoutInfo | null;
  saveLayout: (name: string, state: unknown) => Promise<LayoutInfo>;
  loadLayout: (layoutId: string) => Promise<unknown>;
  deleteLayout: (layoutId: string) => Promise<void>;
  setActiveLayout: (layoutId: string) => void;

  onSave: (handler: () => Promise<void> | void) => () => void;
  onDestroy: (handler: () => void) => () => void;

  open: (widgetType: string, data?: Record<string, unknown>) => Promise<void>;
  broadcast: (topic: string, data: unknown) => void;
  subscribe: (topic: string, handler: (data: unknown) => void) => () => void;
  launchData: Record<string, unknown> | null;

  openSettings: (screenId: string, data?: Record<string, unknown>) => Promise<void>;

  platform: PlatformAdapter;
}
