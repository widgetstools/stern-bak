import React from 'react';
import type { WidgetProps } from '@wellsfargo-starui/core/widget';
import type { SlotContent, WidgetExtensionConfig } from '../types/slots.js';

/**
 * createExtendedWidget — factory that creates a reusable extended variant of a base widget.
 * Injects slots, toolbar actions, and wraps with HOC wrappers.
 *
 * Usage:
 *   const OrdersBlotter = createExtendedWidget(SimpleBlotter, {
 *     displayName: 'OrdersBlotter',
 *     slots: { footer: <PositionSummary /> },
 *     toolbarActions: { export: (ctx) => exportToCsv(ctx.selectedRows) },
 *     wrappers: [withKeyboardShortcuts, withAuditLogging]
 *   });
 */
export function createExtendedWidget<
  P extends WidgetProps & { slots?: S; toolbarActions?: Record<string, Function> },
  S = Record<string, SlotContent>
>(
  BaseWidget: React.ComponentType<P>,
  config: WidgetExtensionConfig<S>
): React.ComponentType<Omit<P, 'slots' | 'toolbarActions'> & { slots?: Partial<S>; toolbarActions?: Record<string, Function> }> {
  const Extended = (props: Omit<P, 'slots' | 'toolbarActions'> & { slots?: Partial<S>; toolbarActions?: Record<string, Function> }) => {
    // Merge default slots with override slots
    const mergedSlots = {
      ...config.slots,
      ...props.slots
    } as S;

    // Merge default toolbar actions with override actions
    const mergedActions = {
      ...config.toolbarActions,
      ...props.toolbarActions
    };

    const widgetProps = {
      ...props,
      slots: mergedSlots,
      toolbarActions: mergedActions
    } as unknown as P;

    let element = <BaseWidget {...widgetProps} />;

    // Wrap with HOC wrappers (innermost first)
    if (config.wrappers) {
      for (let i = config.wrappers.length - 1; i >= 0; i--) {
        const Wrapper = config.wrappers[i];
        element = <Wrapper>{element}</Wrapper>;
      }
    }

    return element;
  };

  Extended.displayName = config.displayName || `Extended(${(BaseWidget as any).displayName || BaseWidget.name || 'Widget'})`;

  return Extended;
}
