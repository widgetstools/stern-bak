import type { PlatformAdapter } from '@wellsfargo-starui/widget';
import type { WidgetRegistry } from '../registry/WidgetRegistry.js';

/**
 * WidgetHostProps — props for the React WidgetHost provider component.
 */
export interface WidgetHostProps {
  apiUrl: string;
  userId: string;
  platform?: PlatformAdapter;
  registry?: WidgetRegistry;
  theme?: 'light' | 'dark';
  children: React.ReactNode;
}
