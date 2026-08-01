import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { WidgetProps } from '@wellsfargo-starui/core/widget';
import type { WidgetEnhancer } from '../types/slots.js';
import { compose } from './compose.js';

function Base({ configId }: WidgetProps) {
  return <p>base:{configId}</p>;
}

/**
 * An enhancer that wraps the widget in a labelled group. Nesting in the
 * rendered DOM is what proves the application order — asserting on the
 * returned component identity would pass even if the order reversed.
 */
function tag(name: string): WidgetEnhancer {
  return (Component) =>
    function Tagged(props: WidgetProps) {
      return (
        <div role="group" aria-label={name}>
          <Component {...props} />
        </div>
      );
    };
}

afterEach(cleanup);

describe('compose', () => {
  it('returns the widget untouched when there are no enhancers', () => {
    // Identity, not a pass-through wrapper: an extra component in the tree
    // would remount the widget on every re-render of the enhancer chain.
    expect(compose<WidgetProps>()(Base)).toBe(Base);
  });

  it('returns the single enhancer as-is', () => {
    const only = tag('only');
    expect(compose(only)).toBe(only);
  });

  it('applies enhancers left to right — compose(a, b, c) === a(b(c(Widget)))', () => {
    const Enhanced = compose(tag('a'), tag('b'), tag('c'))(Base);
    render(<Enhanced configId="cfg-1" />);

    const a = screen.getByRole('group', { name: 'a' });
    const b = within(a).getByRole('group', { name: 'b' });
    const c = within(b).getByRole('group', { name: 'c' });
    expect(within(c).getByText('base:cfg-1')).toBeDefined();
  });

  it('forwards props through the whole chain to the base widget', () => {
    const Enhanced = compose(tag('outer'), tag('inner'))(Base);
    render(<Enhanced configId="cfg-42" />);

    expect(screen.getByText('base:cfg-42')).toBeDefined();
  });
});
