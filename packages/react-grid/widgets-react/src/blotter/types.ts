import type { GridApi } from 'ag-grid-community';
import type { WidgetContext, SlotContent } from '@wellsfargo-starui/react/widget-sdk';

/**
 * BlotterSlots — extension points for the SimpleBlotter.
 */
export interface BlotterSlots {
  header?: SlotContent<BlotterSlotContext>;
  beforeToolbar?: SlotContent<BlotterSlotContext>;
  afterToolbar?: SlotContent<BlotterSlotContext>;
  footer?: SlotContent<BlotterSlotContext>;
  statusBar?: SlotContent<BlotterSlotContext>;
  emptyState?: SlotContent<BlotterSlotContext>;
}

export interface BlotterSlotContext {
  widget: WidgetContext;
  gridApi: GridApi | null;
  selectedRows: Record<string, unknown>[];
}

/**
 * ToolbarButton — custom toolbar button definition.
 */
export interface ToolbarButton {
  id: string;
  label: string;
  icon?: string;
  actionId?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  position?: 'left' | 'center' | 'right';
}

/**
 * GridColumnConfig — column configuration from the config service.
 */
export interface GridColumnConfig {
  field: string;
  headerName?: string;
  width?: number;
  hide?: boolean;
  pinned?: 'left' | 'right' | null;
  flex?: number;
  cellDataType?: string;
  valueFormatter?: string;
  editable?: boolean;
  cellRenderer?: string;
}

/**
 * LayoutState — captured grid state for layouts.
 */
export interface LayoutState {
  columnState?: Record<string, unknown>[];
  filterModel?: Record<string, unknown>;
  sortModel?: Record<string, unknown>[];
  columnGroupState?: Record<string, unknown>[];
  providerId?: string;
  toolbarState?: {
    isCollapsed: boolean;
    isPinned: boolean;
  };
}
