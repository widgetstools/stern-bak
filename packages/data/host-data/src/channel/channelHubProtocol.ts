import type { ProviderConfig, ProviderStatus } from '@wellsfargo-starui/types';
import { DEFAULT_MARKETSUI_DATA_HUB_CHANNEL } from '@wellsfargo-starui/types';

export { DEFAULT_MARKETSUI_DATA_HUB_CHANNEL };

/** OpenFin Channel actions for the dock-hosted data hub. */
export const CHANNEL_HUB_ACTIONS = {
  PING: 'ping',
  ATTACH: 'attach',
  DETACH: 'detach',
  REFRESH: 'refresh',
  RESTART: 'restart',
  /** Provider → client push (delta, status, rows-received). */
  HUB_EVENT: 'hub-event',
} as const;

export type ChannelHubReply<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ChannelHubAttachRequest {
  /** Upstream catalog provider id the hub runs (STOMP, mock, …). */
  providerId: string;
  extra?: Record<string, unknown>;
}

export interface ChannelHubAttachResult {
  subscriptionId: string;
  config: ProviderConfig;
  snapshot: readonly Record<string, unknown>[];
  status: ProviderStatus;
}

export interface ChannelHubSubscriptionRequest {
  subscriptionId: string;
}

export interface ChannelHubRestartRequest extends ChannelHubSubscriptionRequest {
  extra?: Record<string, unknown>;
}

export interface ChannelHubRefreshResult {
  snapshot: readonly Record<string, unknown>[];
}

export type ChannelHubEventPayload =
  | {
      subscriptionId: string;
      type: 'delta';
      rows: readonly Record<string, unknown>[];
      replace?: boolean;
    }
  | {
      subscriptionId: string;
      type: 'status';
      status: ProviderStatus;
      error?: string;
    }
  | {
      subscriptionId: string;
      type: 'rows-received';
      count: number;
    }
  | {
      subscriptionId: string;
      type: 'error';
      message: string;
    };

export function resolveChannelHubName(override?: string): string {
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_MARKETSUI_DATA_HUB_CHANNEL;
}
