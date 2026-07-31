import type { WidgetProps } from '@wellsfargo-starui/widget';

/**
 * WidgetRegistry — maps widget type strings to React components.
 * Used by WidgetHost to resolve widget types for rendering.
 */
export class WidgetRegistry {
  private widgets = new Map<string, React.ComponentType<WidgetProps>>();

  constructor(widgets?: Record<string, React.ComponentType<WidgetProps>>) {
    if (widgets) {
      for (const [type, component] of Object.entries(widgets)) {
        this.widgets.set(type, component);
      }
    }
  }

  register(type: string, component: React.ComponentType<WidgetProps>): void {
    this.widgets.set(type, component);
  }

  resolve(type: string): React.ComponentType<WidgetProps> | null {
    return this.widgets.get(type) || null;
  }

  getTypes(): string[] {
    return Array.from(this.widgets.keys());
  }
}
