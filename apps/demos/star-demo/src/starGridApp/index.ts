/**
 * Vendored from the former `@wellsfargo-starui/app` package.
 *
 * That package was deleted from the platform repo — star-demo was its only
 * remaining consumer, and it was never depended on by any other package. The
 * source is kept verbatim here rather than reimplemented, so the OpenFin
 * bootstrap behaviour is unchanged.
 */
export { StarGridApp, type StarGridAppProps } from './StarGridApp.js';
export {
  StarGridAppProvider,
  useStarGridApp,
  useStarGridHost,
} from './StarGridAppContext.js';
export { buildGridHostContext, storageFactoryForPersistence } from './buildHostContext.js';
export { defineStarGridPlugin, type StarGridPlugin } from './plugins.js';
export type {
  StarGridAppOptions,
  StarGridAppState,
  StarGridHostScope,
  StarGridPersistence,
} from './types.js';
