/**
 * ConfigPort — cross-instance configuration sync (ConfigManager).
 * Optional: grid works with local-only storage when omitted.
 *
 * Full interface lands in phase 5 when @wellsfargo-starui/core/host/config is ported.
 */
export interface ConfigPort {
  readonly appId: string;
  readonly userId: string;
  /** Notify listeners when external writers update persisted rows. */
  subscribe?(gridId: string, fn: () => void): () => void;
}
