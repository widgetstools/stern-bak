/**
 * AppData provider — config-only "kind of provider".
 *
 * Unlike the streaming providers in `../transports/`, AppData is a
 * key/value bag whose values get inlined into other providers'
 * configs via `{{name.key}}` substitution upstream of the worker.
 * It has no `start/stop/snapshot/onUpdate` lifecycle and so doesn't
 * register with the provider factory registry.
 *
 * The reactive in-memory + cross-window state lives in
 * `../../mirror/AppDataMirror` (main thread) backed by
 * `../../worker/WorkerAppDataStore` (SharedWorker). This module
 * exports only the persistence-layer types.
 */

export {
  AppDataConfigStore,
  COMPONENT_TYPE_APPDATA,
  type AppDataConfig,
} from './store.js';
