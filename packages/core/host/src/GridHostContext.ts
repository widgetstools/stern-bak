import type { RuntimePort } from './RuntimePort.js';
import type { StoragePort } from './StoragePort.js';
import type { DataPort } from './DataPort.js';

/**
 * GridHostContext — single object passed to MarketsGrid / StarGrid hosts.
 * Replaces the legacy 4-deep React provider stack.
 */
export interface GridHostContext {
  readonly runtime: RuntimePort;
  readonly storage: StoragePort;
  readonly data?: DataPort;
}

export interface GridHostContextOptions {
  runtime: RuntimePort;
  storage: StoragePort;
  data?: DataPort;
}

export function createGridHostContext(options: GridHostContextOptions): GridHostContext {
  return Object.freeze({
    runtime: options.runtime,
    storage: options.storage,
    ...(options.data !== undefined ? { data: options.data } : {}),
  });
}
