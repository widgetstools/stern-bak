/**
 * The holder exists because AG Grid reads `context` ONCE, when it creates the
 * grid, while the engine behind it is swapped whenever the Table changes.
 * Every test here is a way a reader could end up pinned to a closed engine.
 */

import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveRowEngine } from '@wellsfargo-starui/grid/perspective';
import { createPerspectiveEngineHolder } from './perspectiveEngineHolder';

const engine = (id: string) => ({ id }) as unknown as PerspectiveRowEngine;

describe('createPerspectiveEngineHolder', () => {
  it('starts empty', () => {
    expect(createPerspectiveEngineHolder().get()).toBeNull();
  });

  it('hands the current engine to a subscriber IMMEDIATELY', () => {
    const holder = createPerspectiveEngineHolder();
    const first = engine('a');
    holder.set(first);

    const seen = vi.fn();
    holder.subscribe(seen);

    // A subscriber that mounted after the swap it cared about would otherwise
    // wait forever for a second one — which is the status bar reading "0 rows"
    // over a full book.
    expect(seen).toHaveBeenCalledWith(first);
  });

  it('notifies every subscriber on a swap', () => {
    const holder = createPerspectiveEngineHolder();
    const a = vi.fn();
    const b = vi.fn();
    holder.subscribe(a);
    holder.subscribe(b);
    a.mockClear();
    b.mockClear();

    const next = engine('next');
    holder.set(next);

    expect(a).toHaveBeenCalledWith(next);
    expect(b).toHaveBeenCalledWith(next);
    expect(holder.get()).toBe(next);
  });

  it('does not notify when the engine is unchanged', () => {
    const holder = createPerspectiveEngineHolder();
    const only = engine('only');
    holder.set(only);
    const seen = vi.fn();
    holder.subscribe(seen);
    seen.mockClear();

    holder.set(only);

    expect(seen).not.toHaveBeenCalled();
  });

  it('reports a teardown to null', () => {
    const holder = createPerspectiveEngineHolder();
    holder.set(engine('a'));
    const seen = vi.fn();
    holder.subscribe(seen);
    seen.mockClear();

    holder.set(null);

    expect(seen).toHaveBeenCalledWith(null);
    expect(holder.get()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const holder = createPerspectiveEngineHolder();
    const seen = vi.fn();
    const off = holder.subscribe(seen);
    seen.mockClear();

    off();
    holder.set(engine('after'));

    expect(seen).not.toHaveBeenCalled();
  });

  it('survives a subscriber unsubscribing during a notification', () => {
    const holder = createPerspectiveEngineHolder();
    const later = vi.fn();
    let off: (() => void) | null = null;
    off = holder.subscribe(() => off?.());
    holder.subscribe(later);
    later.mockClear();

    // Iterating the live set while it mutates would skip the second listener.
    expect(() => holder.set(engine('x'))).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
  });
});
