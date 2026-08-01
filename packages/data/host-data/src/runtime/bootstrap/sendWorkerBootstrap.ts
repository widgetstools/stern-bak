/**
 * Post the deployment payload the SharedWorker entry boots its ConfigManager
 * from.
 *
 * This is the ONLY channel that reaches into a SharedWorker. The previous
 * design wrote these fields to localStorage for the worker to read back,
 * which silently never worked — a worker global has no Storage APIs at all,
 * so every field arrived `undefined` and `configServiceRestUrl` was ignored.
 *
 * Call this immediately after constructing the worker and before any other
 * traffic on the port: `defaultEntry` blocks ConfigManager construction on
 * this message, and buffers whatever else arrives meanwhile.
 */

import type { WorkerBootstrapRequest } from '../protocol.js';

export interface WorkerBootstrapInput {
  appId: string;
  /**
   * Omit for an anonymous boot. The worker treats a missing/blank userId as
   * an explicit "no identity" signal and boots local/anonymous straight
   * away, rather than waiting out its handshake timeout.
   */
  userId?: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
  configServiceRestUrl?: string;
}

export function sendWorkerBootstrap(port: MessagePort, input: WorkerBootstrapInput): void {
  const message: WorkerBootstrapRequest = {
    kind: 'worker-bootstrap',
    payload: {
      appId: input.appId,
      userId: input.userId ?? '',
      seedConfigUrl: input.seedConfigUrl,
      seedConfigReload: input.seedConfigReload,
      configServiceRestUrl: input.configServiceRestUrl,
    },
  };

  try {
    port.postMessage(message);
  } catch (err) {
    // Don't take the app down — but this is loud on purpose: without the
    // handshake the worker falls back to local/anonymous and any
    // configServiceRestUrl is silently ignored.
    // eslint-disable-next-line no-console
    console.error(
      '[@wellsfargo-starui/data] failed to send the worker bootstrap handshake; '
        + 'the SharedWorker will run local/anonymous',
      err,
    );
  }
}
