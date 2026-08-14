/**
 * Public surface for hosted-view primitives.
 *
 * The hosted wrappers collapsed into `<StarGrid>`; what remains here is
 * the workspace-host bridge (`useHostedStarui`) and the à-la-carte
 * identity / theme / linking / lifecycle hooks StarGrid composes.
 */

export type {
  HostedContext,
  RegisteredComponentMetadata,
  ConfigManager,
  StorageAdapterFactory,
} from './types.js';

export { useHostedIdentity } from './useHostedIdentity.js';
export {
  useHostedStarui,
  type UseHostedStaruiArgs,
  type UseHostedStaruiResult,
} from './useHostedStarui.js';
export type {
  UseHostedIdentityArgs,
  UseHostedIdentityResult,
} from './useHostedIdentity.js';

export { useAgGridTheme } from './useAgGridTheme.js';
export type { AgGridThemeMode } from './useAgGridTheme.js';

export { useTabsHidden, deriveTabsHidden } from './useTabsHidden.js';
export { useViewTabTitle, type ViewTabTitle } from './useViewTabTitle.js';

export { useColorLinking, deriveColorLinking } from './useColorLinking.js';
export type { ColorLinkingState } from './useColorLinking.js';

export { useFdc3Channel } from './useFdc3Channel.js';
export type {
  Fdc3Context,
  Fdc3ContextHandler,
  UseFdc3ChannelResult,
} from './useFdc3Channel.js';

export { useWorkspaceSaveEvent } from './useWorkspaceSaveEvent.js';
export type {
  WorkspaceSaveCallback,
  WorkspaceSavedCallback,
  UseWorkspaceSaveEventOptions,
} from './useWorkspaceSaveEvent.js';


export { useGridContextLink } from './useGridContextLink.js';
export type {
  GridContextLinkConfig,
  GridContextLinkAdvanced,
  UseGridContextLinkArgs,
} from './useGridContextLink.js';
export type { GridLinkTransport } from './gridContextLink.js';
export {
  GRID_LINK_CONTEXT_TYPE,
  buildSelectionContext,
  defaultGridLinkResolver,
  createRowIdSetFilterResolver,
  applyGridLinkContext,
  normalizeRowIdField,
} from './gridContextLink.js';
export type {
  GridLinkSelectionContext,
  GridLinkResolver,
  GridLinkSelectionBuilder,
} from './gridContextLink.js';

export { useInteropChannel, isInteropAvailable } from './useInteropChannel.js';
export { useGridLinkNotifications } from './useGridLinkNotifications.js';
export type {
  UseGridLinkNotificationsArgs,
  GridLinkNotificationCallbacks,
} from './useGridLinkNotifications.js';
export {
  summarizeCriteria,
  summarizeLinkContext,
  buildSelectionNotification,
  buildAckNotification,
} from './gridLinkNotifications.js';
export type { GridLinkNotificationContent } from './gridLinkNotifications.js';


export { createSsrmSelectionContextBuilder } from './ssrmGridContextLink.js';
export type { SsrmSelectionBuilderDeps } from './ssrmGridContextLink.js';
