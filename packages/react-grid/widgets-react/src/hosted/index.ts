/**
 * Public surface for hosted-feature wrappers.
 *
 * Today: the type contract used by `<HostedMarketsGrid>` and the
 * underlying identity / storage primitives. Future sessions of the
 * HostedMarketsGrid refactor add the hooks and the wrapper component
 * itself to this barrel.
 */

export type {
  HostedContext,
  RegisteredComponentMetadata,
  ConfigManager,
  StorageAdapterFactory,
} from './types.js';

export { useHostedIdentity } from './useHostedIdentity.js';
export type {
  UseHostedIdentityArgs,
  UseHostedIdentityResult,
} from './useHostedIdentity.js';

export { useAgGridTheme } from './useAgGridTheme.js';
export type { AgGridThemeMode } from './useAgGridTheme.js';

export { useIab } from './useIab.js';
export type {
  IabSender,
  IabSource,
  IabHandler,
  UseIabResult,
} from './useIab.js';

export { useOpenFinChannel } from './useOpenFinChannel.js';
export type {
  ChannelActionFn,
  ChannelProviderHandle,
  ChannelClientHandle,
  UseOpenFinChannelResult,
} from './useOpenFinChannel.js';

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

export { useHostedView } from './useHostedView.js';
export type { UseHostedViewArgs, UseHostedViewResult } from './useHostedView.js';

export { useGridContextLink } from './useGridContextLink.js';
export type {
  GridContextLinkConfig,
  UseGridContextLinkArgs,
} from './useGridContextLink.js';
export {
  GRID_LINK_CONTEXT_TYPE,
  buildSelectionContext,
  defaultGridLinkResolver,
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

export { HostedMarketsGrid } from './HostedMarketsGrid.js';
export type { HostedMarketsGridProps } from './HostedMarketsGrid.js';

export { HostedSsrmMarketsGrid } from './HostedSsrmMarketsGrid.js';
export type { HostedSsrmMarketsGridProps } from './HostedSsrmMarketsGrid.js';
