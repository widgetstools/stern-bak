import { describe, expect, it } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus', () => {
  it('delivers payloads to registered handlers synchronously', () => {
    const bus = new EventBus<{ tick: number; msg: string }>();
    const ticks: number[] = [];
    bus.on('tick', (n) => ticks.push(n));
    bus.emit('tick', 1);
    bus.emit('tick', 2);
    expect(ticks).toEqual([1, 2]);
  });

  it('no-ops emit when no handlers registered', () => {
    const bus = new EventBus<{ x: number }>();
    expect(() => bus.emit('x', 1)).not.toThrow();
  });

  it('unsubscribes via returned disposer', () => {
    const bus = new EventBus<{ x: number }>();
    const seen: number[] = [];
    const off = bus.on('x', (v) => seen.push(v));
    bus.emit('x', 1);
    off();
    bus.emit('x', 2);
    expect(seen).toEqual([1]);
  });

  it('creates handler set lazily on first subscription', () => {
    const bus = new EventBus<{ a: string }>();
    const seen: string[] = [];
    bus.on('a', (v) => seen.push(v));
    bus.emit('a', 'ok');
    expect(seen).toEqual(['ok']);
  });
});
