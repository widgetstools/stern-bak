import { useEffect } from 'react';
import type { Theme } from 'ag-grid-community';

import {
  useHostedIdentity,
  type UseHostedIdentityArgs,
  type UseHostedIdentityResult,
} from './useHostedIdentity.js';
import { useAgGridTheme, type AgGridThemeMode } from './useAgGridTheme.js';
import { useTabsHidden } from './useTabsHidden.js';
import { useColorLinking, type ColorLinkingState } from './useColorLinking.js';
import { useFdc3Channel, type UseFdc3ChannelResult } from './useFdc3Channel.js';
import { useOpenFinChannel, type UseOpenFinChannelResult } from './useOpenFinChannel.js';
import { useIab, type UseIabResult } from './useIab.js';
import {
  useWorkspaceSaveEvent,
  type WorkspaceSaveCallback,
  type UseWorkspaceSaveEventOptions,
} from './useWorkspaceSaveEvent.js';

/**
 * Arguments for {@link useHostedView}. Extends the identity hook so a
 * single call site provides everything the composing hook needs.
 */
export interface UseHostedViewArgs extends UseHostedIdentityArgs {
  /** AG-Grid theme mode forwarded to {@link useAgGridTheme}. */
  theme?: AgGridThemeMode;
  /**
   * Async flush callback invoked when the OpenFin platform dispatches
   * `'workspace-saving'`. The promise this returns blocks the snapshot
   * capture, so keep it bounded (e.g. one `saveActiveProfile()` call).
   */
  onWorkspaceSave?: WorkspaceSaveCallback;
  /** Optional companion options forwarded to {@link useWorkspaceSaveEvent}. */
  workspaceSaveOptions?: UseWorkspaceSaveEventOptions;
  /**
   * Optional FDC3 user-channel auto-join on mount. Most consumers call
   * `useFdc3Channel()` directly for full control; this is a convenience
   * for the common "join one channel and forget" case.
   */
  fdc3?: { autoJoin?: string };
}

/**
 * Result of {@link useHostedView}. Each top-level field corresponds to a
 * sub-hook so consumers can destructure exactly what they need.
 */
export interface UseHostedViewResult {
  /** Resolved hosted identity. See {@link UseHostedIdentityResult.identity}. */
  identity: UseHostedIdentityResult['identity'];
  /** True once `identity.instanceId` has resolved. */
  ready: boolean;
  /** AG-Grid `Theme` object reactive to the host's `[data-theme]`. */
  agTheme: Theme;
  /** True when the parent OpenFin window has hidden its view tabs. */
  tabsHidden: boolean;
  /** Generic IAB pub/sub helpers — stable identity. */
  iab: UseIabResult;
  /** Linking surfaces: workspace color, FDC3, and the OpenFin Channel API. */
  linking: {
    color: ColorLinkingState;
    fdc3: UseFdc3ChannelResult;
    channel: UseOpenFinChannelResult;
  };
}

/**
 * Single composing entry point for hosted-view features. Wires every
 * primitive in `hosted/` — identity, theme, tab visibility, IAB,
 * Channel API, color linking, FDC3, and the workspace-save event — and
 * returns the union of their state and helpers.
 *
 * Each sub-hook is also exported standalone so consumers can pick
 * à-la-carte. Use `useHostedView` when you want everything; otherwise
 * compose the pieces yourself.
 *
 * Workspace-save registration is opt-in: `onWorkspaceSave` is only
 * forwarded when defined, so views that don't need to flush state on
 * `Save Workspace` don't open a Channel connection at all.
 */
export function useHostedView(args: UseHostedViewArgs): UseHostedViewResult {
  const { theme, onWorkspaceSave, workspaceSaveOptions, fdc3: fdc3Args, ...identityArgs } = args;

  const { identity, ready } = useHostedIdentity(identityArgs);
  const agTheme = useAgGridTheme(theme);
  const tabsHidden = useTabsHidden();
  const color = useColorLinking();
  const fdc3 = useFdc3Channel();
  const channel = useOpenFinChannel();
  const iab = useIab();

  useWorkspaceSaveEvent(onWorkspaceSave, workspaceSaveOptions);

  // Optional FDC3 auto-join. Re-runs whenever the requested channel id
  // changes; leaving the channel on unmount is intentionally not done
  // here — apps that want explicit leave semantics should use
  // `useFdc3Channel` directly.
  const autoJoin = fdc3Args?.autoJoin;
  const join = fdc3.join;
  useEffect(() => {
    if (!autoJoin) return;
    void join(autoJoin);
  }, [autoJoin, join]);

  return {
    identity,
    ready,
    agTheme,
    tabsHidden,
    iab,
    linking: { color, fdc3, channel },
  };
}
