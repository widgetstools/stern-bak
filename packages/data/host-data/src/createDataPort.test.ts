/**
 * `createDataPort` adapts an `AppDataMirror` to the host's `DataPort`.
 *
 * The contract that matters to the host: a snapshot is only handed out
 * once the mirror is ready, every snapshot carries a strictly increasing
 * `revision` (React's `useSyncExternalStore` compares snapshot identity,
 * and a stale revision would suppress a re-render), and the subscription
 * suppresses notifications fired before readiness.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDataPort } from './createDataPort.js';
import type { AppDataMirror } from './runtime/mirror/AppDataMirror.js';

function fakeMirror(overrides: Partial<{
  ready: Promise<void>;
  isReady: boolean;
  values: Record<string, unknown>;
}> = {}) {
  const listeners = new Set<() => void>();
  const state = {
    isReady: overrides.isReady ?? true,
    values: overrides.values ?? {},
  };
  const mirror = {
    ready: () => overrides.ready ?? Promise.resolve(),
    isReady: () => state.isReady,
    get: (name: string, key: string) => state.values[`${name}.${key}`],
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  } as unknown as AppDataMirror;
  return { mirror, state, notify: () => listeners.forEach((fn) => fn()), listeners };
}

describe('createDataPort', () => {
  it('exposes the mirror\'s ready promise directly', async () => {
    const ready = Promise.resolve();
    const { mirror } = fakeMirror({ ready });
    expect(createDataPort(mirror).ready).toBe(ready);
  });

  it('returns null from getSnapshot until the mirror is ready', () => {
    const { mirror, state } = fakeMirror({ isReady: false });
    const port = createDataPort(mirror);
    expect(port.getSnapshot()).toBeNull();

    state.isReady = true;
    expect(port.getSnapshot()).not.toBeNull();
  });

  it('resolves lookups through the mirror', () => {
    const { mirror } = fakeMirror({ values: { 'ApplicationContext.AppId': 'TestApp' } });
    const snapshot = createDataPort(mirror).getSnapshot()!;
    expect(snapshot.lookup('ApplicationContext', 'AppId')).toBe('TestApp');
    expect(snapshot.lookup('ApplicationContext', 'Missing')).toBeUndefined();
  });

  it('hands out a strictly increasing revision on every snapshot', () => {
    const { mirror } = fakeMirror();
    const port = createDataPort(mirror);
    const first = port.getSnapshot()!.revision;
    const second = port.getSnapshot()!.revision;
    expect(second).toBeGreaterThan(first);
  });

  it('notifies the subscriber with a fresh snapshot when the mirror changes', () => {
    const { mirror, state, notify } = fakeMirror({ values: { 'Ctx.k': 1 } });
    const port = createDataPort(mirror);
    const seen: number[] = [];
    port.subscribe((snap) => seen.push(snap.revision));

    notify();
    state.values['Ctx.k'] = 2;
    notify();

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeGreaterThan(seen[0]);
  });

  it('swallows notifications fired before the mirror is ready', () => {
    // The mirror emits during hydration; forwarding a half-built
    // snapshot would let the host render against empty AppData.
    const { mirror, state, notify } = fakeMirror({ isReady: false });
    const port = createDataPort(mirror);
    const fn = vi.fn();
    port.subscribe(fn);

    notify();
    expect(fn).not.toHaveBeenCalled();

    state.isReady = true;
    notify();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing detaches the mirror listener', () => {
    const { mirror, notify, listeners } = fakeMirror();
    const port = createDataPort(mirror);
    const fn = vi.fn();
    const unsubscribe = port.subscribe(fn);

    expect(listeners.size).toBe(1);
    unsubscribe();
    expect(listeners.size).toBe(0);

    notify();
    expect(fn).not.toHaveBeenCalled();
  });
});
