import { describe, expect, it, vi } from 'vitest';
import { DirtyBus } from './DirtyBus';

describe('DirtyBus', () => {
  it('set + isDirty round-trip', () => {
    const bus = new DirtyBus();
    expect(bus.isDirty('k1')).toBe(false);
    bus.set('k1', true);
    expect(bus.isDirty('k1')).toBe(true);
    bus.set('k1', false);
    expect(bus.isDirty('k1')).toBe(false);
  });

  it('count + keys track dirty entries', () => {
    const bus = new DirtyBus();
    expect(bus.count()).toBe(0);
    expect(bus.keys()).toEqual([]);
    bus.set('a', true);
    bus.set('b', true);
    bus.set('c', false);
    expect(bus.count()).toBe(2);
    expect(bus.keys().sort()).toEqual(['a', 'b']);
  });

  it('set coalesces — no notify on same-state update', () => {
    const bus = new DirtyBus();
    const fn = vi.fn();
    bus.subscribe(fn);

    bus.set('k1', false); // key wasn't dirty, setting false → no change
    expect(fn).not.toHaveBeenCalled();

    bus.set('k1', true);
    expect(fn).toHaveBeenCalledTimes(1);

    bus.set('k1', true); // re-flipping true → no change
    expect(fn).toHaveBeenCalledTimes(1);

    bus.set('k1', false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('subscriber disposer stops notifications', () => {
    const bus = new DirtyBus();
    const fn = vi.fn();
    const dispose = bus.subscribe(fn);

    bus.set('a', true);
    expect(fn).toHaveBeenCalledTimes(1);

    dispose();
    bus.set('a', false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reset clears every entry and notifies once', () => {
    const bus = new DirtyBus();
    bus.set('a', true);
    bus.set('b', true);
    bus.set('c', true);

    const fn = vi.fn();
    bus.subscribe(fn);

    bus.reset();
    expect(bus.count()).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reset on an empty bus is a no-op', () => {
    const bus = new DirtyBus();
    const fn = vi.fn();
    bus.subscribe(fn);
    bus.reset();
    expect(fn).not.toHaveBeenCalled();
  });

  it('survives a subscriber that throws', () => {
    const bus = new DirtyBus();
    bus.subscribe(() => { throw new Error('boom'); });
    const ok = vi.fn();
    bus.subscribe(ok);

    // Silence the internal console.warn for the throw path.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => bus.set('k', true)).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('tolerates subscribe / unsubscribe inside a handler', () => {
    const bus = new DirtyBus();
    const runs: string[] = [];

    bus.subscribe(() => {
      runs.push('a');
      // A handler removing itself MUST not corrupt the current dispatch —
      // we snapshot the listeners set before iterating.
      bus.subscribe(() => runs.push('b'));
    });

    bus.set('k', true);
    bus.set('k', false);

    // First dispatch: only 'a' (b was added during 'a', sees the next dispatch).
    // Second dispatch: 'a' again, 'b' now present → 'b' fires once.
    expect(runs).toEqual(['a', 'a', 'b']);
  });
});
