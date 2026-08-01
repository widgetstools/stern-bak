import type { DataPort } from '@wellsfargo-starui/core/host';
import type { AppDataSnapshot } from '@wellsfargo-starui/types';
import type { AppDataMirror } from './runtime/mirror/AppDataMirror.js';

let revision = 0;

function snapshotFromMirror(mirror: AppDataMirror): AppDataSnapshot {
  revision += 1;
  return {
    revision,
    lookup(name: string, key: string) {
      return mirror.get(name, key);
    },
  };
}

/**
 * Wrap an AppDataMirror (from bootstrapDataServices) as a host DataPort.
 */
export function createDataPort(mirror: AppDataMirror): DataPort {
  return {
    ready: mirror.ready(),
    getSnapshot(): AppDataSnapshot | null {
      if (!mirror.isReady()) return null;
      return snapshotFromMirror(mirror);
    },
    subscribe(fn) {
      return mirror.subscribe(() => {
        if (!mirror.isReady()) return;
        fn(snapshotFromMirror(mirror));
      });
    },
  };
}
