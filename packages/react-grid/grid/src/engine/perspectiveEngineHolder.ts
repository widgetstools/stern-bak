/**
 * A stable handle to a swappable Perspective row engine.
 *
 * AG Grid reads the `context` grid option when it CREATES the grid, and hands
 * that exact object to every status panel it instantiates — once. The engine
 * behind it is not stable: it is rebuilt whenever the Table changes (a
 * provider restart hands over a new one) and React StrictMode double-invokes
 * the mount effect that builds it.
 *
 * So putting the engine on the context directly freezes every reader against
 * the FIRST engine, which is then closed. The visible result is a status bar
 * reading "0 rows" over a full book, with nothing in the console to say why.
 *
 * The holder's identity never changes; what it points at does, and its
 * subscribers are told.
 */

import type { PerspectiveRowEngine } from '@wellsfargo-starui/grid/perspective';
import type { PerspectiveEngineHolder } from './types.js';

export function createPerspectiveEngineHolder(): PerspectiveEngineHolder {
  let current: PerspectiveRowEngine | null = null;
  const listeners = new Set<(engine: PerspectiveRowEngine | null) => void>();

  return {
    get: () => current,

    set(engine) {
      if (engine === current) return;
      current = engine;
      for (const listener of [...listeners]) listener(engine);
    },

    subscribe(listener) {
      listeners.add(listener);
      // Immediately, not on the next swap: a subscriber mounting after the
      // swap it cared about would otherwise wait forever for a second one.
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
