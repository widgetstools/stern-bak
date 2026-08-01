import type { WidgetProps } from '@wellsfargo-starui/core/widget';
import type { WidgetEnhancer } from '../types/slots.js';

/**
 * compose — chains multiple WidgetEnhancers (HOCs) into a single enhancer.
 * Applied left to right: compose(a, b, c)(Widget) === a(b(c(Widget)))
 */
export function compose<P extends WidgetProps>(
  ...enhancers: WidgetEnhancer<P>[]
): WidgetEnhancer<P> {
  if (enhancers.length === 0) {
    return (component) => component;
  }

  if (enhancers.length === 1) {
    return enhancers[0];
  }

  return (component) =>
    enhancers.reduceRight((wrapped, enhancer) => enhancer(wrapped), component);
}
