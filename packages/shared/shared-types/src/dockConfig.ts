/**
 * Dock Configuration Types — runtime dock configuration structures.
 */

export interface DockMenuItem {
  id: string;
  caption: string;
  url: string;
  openMode: 'window' | 'view';
  configType?: string;
  configSubType?: string;
  icon?: string;
  children?: DockMenuItem[];
  order: number;
  metadata?: Record<string, any>;
  windowOptions?: {
    width?: number; height?: number;
    minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number;
    resizable?: boolean; maximizable?: boolean; minimizable?: boolean;
    center?: boolean; alwaysOnTop?: boolean; frame?: boolean; contextMenu?: boolean;
    accelerator?: { zoom?: boolean; reload?: boolean; devtools?: boolean };
  };
  viewOptions?: {
    bounds?: { x?: number; y?: number; width?: number; height?: number };
    customData?: any;
  };
}

export interface DockButton {
  type: 'CustomButton' | 'DropdownButton';
  id: string;
  tooltip: string;
  iconUrl: string;
  action?: { id: string; customData?: any };
  options?: DockButtonOption[];
}

export interface DockButtonOption {
  tooltip: string;
  iconUrl: string;
  action: { id: string; customData?: any };
}

export interface DockConfigFilter {
  userId?: string;
  appId?: string;
  name?: string;
  isShared?: boolean;
  isDefault?: boolean;
  includeDeleted?: boolean;
}

export const DEFAULT_WINDOW_OPTIONS = {
  width: 1200, height: 800, minWidth: 600, minHeight: 400,
  resizable: true, maximizable: true, minimizable: true, center: true,
  frame: true, contextMenu: true,
  accelerator: { zoom: true, reload: true, devtools: true },
};

export const DEFAULT_VIEW_OPTIONS = {
  bounds: { width: 800, height: 600 },
};

export function createMenuItem(partial?: Partial<DockMenuItem>): DockMenuItem {
  return {
    id: partial?.id || `menu-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    caption: partial?.caption || 'New Menu Item',
    url: partial?.url || '',
    openMode: partial?.openMode || 'view',
    icon: partial?.icon,
    children: partial?.children || [],
    order: partial?.order || 0,
    metadata: partial?.metadata || {},
    windowOptions: partial?.windowOptions || DEFAULT_WINDOW_OPTIONS,
    viewOptions: partial?.viewOptions || DEFAULT_VIEW_OPTIONS,
  };
}
