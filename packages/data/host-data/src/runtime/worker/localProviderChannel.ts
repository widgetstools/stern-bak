/**
 * localProviderChannel — the ONE data plane, on the hub thread.
 *
 * There is no separate "hub plane" pipeline any more: a provider that
 * runs on the hub thread (`dataPlane: 'hub'`, or the fail-soft when no
 * window can supply a sub-worker) is the SAME `installProviderWorker`
 * entry the SharedWorker asset runs, driven over a synchronous
 * in-process port pair. `postMessage` is a direct function call, so the
 * wire-visible behaviour — `loading` emitted synchronously from start,
 * replay chunk runs answered inline, `pw-bcast` templates broadcast in
 * the same turn — is identical to the old in-thread pipeline, and the
 * hub test suite runs against it unchanged.
 */

import { installProviderWorker, type InstallProviderWorkerOpts } from './providerWorkerEntry.js';
import type { ProviderWorkerPort } from './providerWorkerHost.js';

/**
 * Create an in-process provider data plane and return the hub-facing
 * port for `startProviderInWorker`. Delivery is synchronous in both
 * directions; `close()` detaches both ends.
 */
export function createLocalProviderChannel(opts: InstallProviderWorkerOpts = {}): ProviderWorkerPort {
  let closed = false;

  const workerEnd: { onmessage: ((ev: MessageEvent) => void) | null; postMessage(m: unknown): void } = {
    onmessage: null,
    postMessage(message: unknown) {
      if (!closed) hubEnd.onmessage?.({ data: message } as MessageEvent);
    },
  };

  const hubEnd: ProviderWorkerPort & { close(): void } = {
    onmessage: null,
    postMessage(message: unknown) {
      if (!closed) workerEnd.onmessage?.({ data: message } as MessageEvent);
    },
    close() {
      closed = true;
      workerEnd.onmessage = null;
      hubEnd.onmessage = null;
    },
  };

  // A bare global: neither `onconnect` nor `postMessage`, so the entry
  // registers nothing globally and we adopt the port explicitly.
  const installed = installProviderWorker({}, opts);
  installed.connect(workerEnd);
  return hubEnd;
}
