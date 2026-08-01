import { createContext, useContext } from 'react';
import type {
  IdentitySnapshot,
  Theme,
  Unsubscribe,
} from '@wellsfargo-starui/types';
import type { RuntimePort } from '@wellsfargo-starui/core/host';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

/**
 * `HostContext` — Seam #2 of the architecture (see docs/ARCHITECTURE.md).
 *
 * The single value a hosted component reads to discover its identity,
 * platform services (config storage, runtime), the current theme, and
 * runtime-event subscription helpers. Component code consumes via
 * `useHost()` and never reaches for `fin.*`, `localStorage`, or
 * routing directly.
 *
 * The shape mirrors `IdentitySnapshot` for identity fields and adds
 * platform services on top.
 */
export interface HostContextValue extends IdentitySnapshot {
  /** Underlying runtime port (OpenFin or Browser). */
  readonly runtime: RuntimePort;

  /** ConfigManager — local Dexie or REST-synced (per `configServiceRestUrl`). */
  readonly configManager: ConfigManager;

  /** Current theme — flips when the runtime broadcasts a change. */
  readonly theme: Theme;

  /** Optional URL of the config service backend (for client-driven REST). */
  readonly configUrl?: string;

  /**
   * Set the active theme. Convenience over `runtime.setTheme(...)` —
   * exposed on the context so toggle callbacks don't need a separate
   * runtime reference. Identical semantics: writes DOM + storage,
   * broadcasts to peer windows, fires `onThemeChanged` subscribers.
   */
  setTheme(theme: Theme): void;

  /**
   * Subscribe to theme changes. Convenience over `runtime.onThemeChanged`
   * — exposed on the context so callers don't need a separate runtime
   * import.
   */
  onThemeChanged(fn: (theme: Theme) => void): Unsubscribe;

  /** Subscribe to "this window/view became visible" events. */
  onWindowShown(fn: () => void): Unsubscribe;

  /** Subscribe to "this window/view is closing" events. */
  onWindowClosing(fn: () => void): Unsubscribe;

  /** Subscribe to runtime-driven customData updates. */
  onCustomDataChanged(fn: (customData: Readonly<Record<string, unknown>>) => void): Unsubscribe;

  /**
   * Subscribe to "the OpenFin platform's workspace just saved." Hosted
   * components use this as a flush-to-disk hook: persist any
   * in-memory state the user expects to survive a workspace reload.
   * In the browser this never fires (no workspace concept).
   */
  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe;
}

export const HostContext = createContext<HostContextValue | null>(null);

/**
 * `useHost()` — read the current `HostContextValue`. Throws if used
 * outside a `<HostWrapper>`. The exception is intentional: silent
 * fallback to a default would mask integration mistakes that surface
 * as wrong identity / wrong storage / wrong theme.
 */
export function useHost(): HostContextValue {
  const ctx = useContext(HostContext);
  if (ctx === null) {
    throw new Error(
      '[host-wrapper-react] useHost must be used within a <HostWrapper>. ' +
        'Wrap the component tree at the app entry point with a HostWrapper ' +
        'that provides a RuntimePort and a ConfigManager.',
    );
  }
  return ctx;
}
