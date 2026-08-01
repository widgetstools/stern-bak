import type { RuntimePort } from './RuntimePort.js';
import type { StoragePort } from './StoragePort.js';
import type { DataPort } from './DataPort.js';
import type { ConfigPort } from './ConfigPort.js';

/**
 * GridHostContext — single object passed to MarketsGrid / HostedMarketsGrid.
 * Replaces the legacy 4-deep React provider stack.
 */
export interface GridHostContext {
  readonly runtime: RuntimePort;
  readonly storage: StoragePort;
  readonly data?: DataPort;
  readonly config?: ConfigPort;
}

export interface GridHostContextOptions {
  runtime: RuntimePort;
  storage: StoragePort;
  data?: DataPort;
  config?: ConfigPort;
}

export function createGridHostContext(options: GridHostContextOptions): GridHostContext {
  return Object.freeze({
    runtime: options.runtime,
    storage: options.storage,
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.config !== undefined ? { config: options.config } : {}),
  });
}
