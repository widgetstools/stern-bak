import type { ProviderType } from '@wellsfargo-starui/types';

/**
 * Declares what an {@link IDataProvider} instance can do for a given
 * transport. Populated by the hub adapter from resolved provider config.
 */
export interface ProviderCapabilities {
  /** Transport kind from the resolved {@link ProviderConfig}. */
  readonly providerType: ProviderType;
  /**
   * Live row stream after the initial snapshot (STOMP, mock).
   * False for one-shot REST and AppData snapshot providers.
   */
  readonly streaming: boolean;
  /**
   * Incremental {@link IDataProvider.onTick} events after snapshot.
   * True for STOMP/mock; false for REST snapshot-only transports.
   */
  readonly realtime: boolean;
  /** {@link IDataProvider.refresh} replays hub cache without upstream I/O. */
  readonly supportsRefresh: boolean;
  /** {@link IDataProvider.restart} re-acquires from upstream. */
  readonly supportsRestart: boolean;
}
