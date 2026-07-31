// Widget framework types for Star Widget Framework

/**
 * Entry in the Widget Route Registry.
 * Maps widget types to URL routes for launching in OpenFin windows
 * and for the Dock Configuration Editor combobox.
 */
export interface WidgetRouteEntry {
  id: string;           // 'simple-blotter' — matches WidgetRegistry key
  label: string;        // 'Simple Blotter'
  route: string;        // '/blotters/simple'
  icon?: string;        // '/icons/blotter.svg'
  description?: string; // 'AG-Grid-based trading blotter'
  category?: string;    // 'Blotters'
}

/**
 * Layout information for widget state persistence.
 * Each widget can have multiple named layouts.
 */
export interface LayoutInfo {
  id: string;
  name: string;
  configId: string;     // parent widget config ID
  isDefault: boolean;
  state: unknown;       // serialized widget state
  createdAt: string;
  updatedAt: string;
}
