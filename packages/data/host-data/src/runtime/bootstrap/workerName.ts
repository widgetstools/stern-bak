/**
 * The SharedWorker name is the browser's identity for the hub: two tabs (or
 * two bootstrap paths) that pass the same name share one worker, and two that
 * differ get two independent hubs — two caches, two upstream connections.
 *
 * It therefore MUST be derived in exactly one place. Both
 * `createDataServicesWorker` and `createDataServicesClient` build their worker
 * from this helper; a literal in either file is how the `:ssrm2` / `:ssrm3`
 * split happened.
 */

/**
 * Hub protocol revision. Bump when the hub protocol gains features, so
 * browsers don't keep serving a stale script for this name — a named
 * SharedWorker pins its first script until every tab using it closes.
 */
export const HUB_PROTOCOL_TAG = 'ssrm3';

/** Canonical SharedWorker name for an app's data-services hub. */
export function dataServicesWorkerName(appName: string): string {
  return `mkt-data-services:${appName}:${HUB_PROTOCOL_TAG}`;
}
