/**
 * @wellsfargo-starui/host-openfin — `RuntimePort` implementation that wraps
 * `fin.*`. See ARCHITECTURE.md "Seam #1 — RuntimePort" and the
 * `OpenFinRuntime` docstring.
 */

export { OpenFinRuntime, type OpenFinRuntimeOptions } from './OpenFinRuntime.js';
export {
  resolveOpenFinIdentity,
  isOpenFin,
  getCurrentView,
  type OpenFinIdentitySources,
} from './identity.js';
export {
  subscribeWindowOptions,
  __resetWindowOptionsSubscriptionForTests,
} from './windowOptionsSubscription.js';
export {
  subscribeParentWindowFocused,
  focusCurrentOpenFinHost,
  __resetWindowFocusSubscriptionForTests,
} from './windowFocusSubscription.js';
export {
  isOpenFin as isOpenFinWindow,
  debugOpenFin,
  openFinWindowOpener,
} from './popoutWindow.js';
export {
  loadOpenFinNotificationsApi,
  dispatchOpenFinNotification,
  type OpenFinNotificationsApi,
  type OpenFinNotificationInput,
} from './notifications.js';
export { subscribeThemeBroadcast, readThemePayload } from './themeBroadcast.js';
