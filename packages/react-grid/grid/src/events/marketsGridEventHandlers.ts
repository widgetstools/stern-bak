import type { AppDataLookup } from '@wellsfargo-starui/core';
import type { ProviderStatus } from '@wellsfargo-starui/types';
import type { MarketsGridHandle } from '../widget/types.js';
import type { ProviderGridHostMode } from '../customizer/providerGridHost/ProviderGridHostContext.js';

export interface MarketsGridEventContext {
  gridId: string;
  instanceId?: string;
  appId?: string;
  userId?: string;
  handle: MarketsGridHandle;
  appData: AppDataLookup;
}

export type MarketsGridEventHandler<TPayload = unknown> = (
  payload: TPayload,
  ctx: MarketsGridEventContext,
) => void | Promise<void>;

export type MarketsGridEventHandlerRegistry = Record<string, MarketsGridEventHandler>;

export type MarketsGridHandlerMeta = Record<string, { label: string; description?: string }>;

export interface ProviderStatusEventPayload {
  status: ProviderStatus;
  error?: string;
  providerId: string | null;
  mode: ProviderGridHostMode;
}

export interface ProviderSwitchedEventPayload {
  liveProviderId: string | null;
  historicalProviderId: string | null;
  mode: ProviderGridHostMode;
}

export interface ProviderDataStaleEventPayload {
  stale: boolean;
  message?: string;
}

export interface ToolbarDateChangedEventPayload {
  date: string;
  historical: boolean;
}
