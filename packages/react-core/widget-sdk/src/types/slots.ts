import type { WidgetProps } from '@wellsfargo-starui/core/widget';
import type { ActionContext } from '@wellsfargo-starui/core/widget';

export type { ActionContext };

/**
 * SlotContent — a slot can be a static React node or a render function.
 */
export type SlotContent<C = Record<string, unknown>> =
  | React.ReactNode
  | ((context: C) => React.ReactNode);

/**
 * WidgetEnhancer — a higher-order component that wraps a widget.
 */
export type WidgetEnhancer<P extends WidgetProps = WidgetProps> = (
  Component: React.ComponentType<P>,
) => React.ComponentType<P>;

/**
 * WidgetExtensionConfig — configuration for createExtendedWidget().
 */
export interface WidgetExtensionConfig<S = Record<string, SlotContent>> {
  displayName?: string;
  slots?: S;
  toolbarActions?: Record<string, (ctx: ActionContext) => void>;
  wrappers?: React.ComponentType<{ children: React.ReactNode }>[];
}
