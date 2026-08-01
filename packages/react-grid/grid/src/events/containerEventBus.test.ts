import { describe, expect, it, vi } from 'vitest';
import { createMarketsGridContainerEventBus } from './containerEventBus.js';

describe('createMarketsGridContainerEventBus', () => {
  it('delivers emitted payloads to registered handlers', () => {
    const bus = createMarketsGridContainerEventBus();
    const handler = vi.fn();
    bus.on('provider:status', handler);
    const payload = { providerId: 'p1', status: 'ready' as const };
    bus.emit('provider:status', payload);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('no-ops emit when no listeners are registered', () => {
    const bus = createMarketsGridContainerEventBus();
    expect(() =>
      bus.emit('toolbar:dateChanged', { date: '2026-01-01' }),
    ).not.toThrow();
  });

  it('unsubscribes a handler and stops delivery', () => {
    const bus = createMarketsGridContainerEventBus();
    const handler = vi.fn();
    const off = bus.on('provider:switched', handler);
    off();
    bus.emit('provider:switched', { from: 'a', to: 'b' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple handlers on the same event', () => {
    const bus = createMarketsGridContainerEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('provider:dataStale', a);
    bus.on('provider:dataStale', b);
    const payload = { providerId: 'p1', stale: true };
    bus.emit('provider:dataStale', payload);
    expect(a).toHaveBeenCalledWith(payload);
    expect(b).toHaveBeenCalledWith(payload);
  });
});
