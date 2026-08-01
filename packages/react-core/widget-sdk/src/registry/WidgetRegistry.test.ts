import { describe, expect, it } from 'vitest';
import type { WidgetProps } from '@wellsfargo-starui/core/widget';
import { WidgetRegistry } from './WidgetRegistry.js';

/**
 * WidgetRegistry maps a widget `type` string to the component WidgetHost
 * renders. An unresolved type must return null rather than throw, because the
 * host renders a fallback for unknown widgets.
 */

const Blotter = (() => null) as unknown as React.ComponentType<WidgetProps>;
const Chart = (() => null) as unknown as React.ComponentType<WidgetProps>;

describe('WidgetRegistry', () => {
  it('starts empty when constructed with no seed', () => {
    const registry = new WidgetRegistry();
    expect(registry.getTypes()).toEqual([]);
    expect(registry.resolve('blotter')).toBeNull();
  });

  it('seeds from a record passed to the constructor', () => {
    const registry = new WidgetRegistry({ blotter: Blotter, chart: Chart });
    expect(registry.getTypes().sort()).toEqual(['blotter', 'chart']);
    expect(registry.resolve('blotter')).toBe(Blotter);
  });

  it('registers a component under a type', () => {
    const registry = new WidgetRegistry();
    registry.register('blotter', Blotter);
    expect(registry.resolve('blotter')).toBe(Blotter);
  });

  it('lets a later registration replace an earlier one', () => {
    const registry = new WidgetRegistry({ blotter: Blotter });
    registry.register('blotter', Chart);
    expect(registry.resolve('blotter')).toBe(Chart);
    expect(registry.getTypes()).toEqual(['blotter']);
  });

  it('returns null for an unknown type rather than throwing', () => {
    expect(new WidgetRegistry().resolve('nope')).toBeNull();
  });

  it('lists registered types in insertion order', () => {
    const registry = new WidgetRegistry();
    registry.register('b', Blotter);
    registry.register('a', Chart);
    expect(registry.getTypes()).toEqual(['b', 'a']);
  });

  it('does not share state between instances', () => {
    const first = new WidgetRegistry({ blotter: Blotter });
    const second = new WidgetRegistry();
    expect(second.resolve('blotter')).toBeNull();
    expect(first.resolve('blotter')).toBe(Blotter);
  });
});
