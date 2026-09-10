/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import {
  CHANNEL_HUB_ACTIONS,
  type ChannelHubAttachRequest,
  type ChannelHubAttachResult,
  type ChannelHubEventPayload,
  type ChannelHubRefreshResult,
  type ChannelHubReply,
  type ChannelHubRestartRequest,
  type ChannelHubSubscriptionRequest,
  resolveChannelHubName,
} from '@wellsfargo-starui/data/channel-hub';
import { ensurePlatformReady, type PlatformBootstrapConfig } from '@wellsfargo-starui/data';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import type { SubscribeHandle } from '@wellsfargo-starui/data/runtime/client';

export { DEFAULT_MARKETSUI_DATA_HUB_CHANNEL } from '@wellsfargo-starui/data/channel-hub';

async function safe<T>(fn: () => Promise<T>): Promise<ChannelHubReply<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface HubSlot {
  subscriptionId: string;
  providerId: string;
  handle: SubscribeHandle;
}

let installed = false;
const slots = new Map<string, HubSlot>();

/** Test-only: reset install guard and tear down slots. */
export function __resetChannelDataHubForTests(): void {
  installed = false;
  for (const slot of slots.values()) {
    slot.handle.unsubscribe();
  }
  slots.clear();
}

type ChannelPublisher = {
  publish(action: string, payload: unknown): unknown;
};

function publishEvent(provider: ChannelPublisher, payload: ChannelHubEventPayload): void {
  try {
    // OpenFin versions differ: `publish` may return a Promise, a plain array, or nothing.
    const result = provider.publish(CHANNEL_HUB_ACTIONS.HUB_EVENT, payload);
    void Promise.resolve(result).catch((err: unknown) => {
      console.warn('[channel-data-hub] publish failed:', err);
    });
  } catch (err) {
    console.warn('[channel-data-hub] publish failed:', err);
  }
}

function wireSlot(provider: ChannelPublisher, slot: HubSlot): void {
  const { subscriptionId, handle } = slot;

  handle.onRowsReceived((count: number) => {
    publishEvent(provider, { subscriptionId, type: 'rows-received', count });
  });

  handle.onStatus((status: ProviderStatus, error?: string) => {
    publishEvent(provider, { subscriptionId, type: 'status', status, error });
  });

  handle.onUpdate((rows: readonly unknown[]) => {
    publishEvent(provider, {
      subscriptionId,
      type: 'delta',
      rows: rows as Record<string, unknown>[],
      replace: false,
    });
  });

  const pushReplace = (rows: readonly unknown[]) => {
    publishEvent(provider, {
      subscriptionId,
      type: 'delta',
      rows: rows as Record<string, unknown>[],
      replace: true,
    });
  };

  handle.onReset(pushReplace);
  handle.onSnapshotCommit(pushReplace);
}

export interface InstallChannelDataHubOpts {
  bootstrap: PlatformBootstrapConfig;
  channelName?: string;
}

/**
 * Install the dock-hosted data hub on an OpenFin Channel. The hub runs
 * upstream providers (STOMP, mock, …) via the local SharedWorker and
 * fans snapshots/deltas to remote windows through IAB.
 */
export async function installChannelDataHub(opts: InstallChannelDataHubOpts): Promise<void> {
  if (installed) return;
  if (typeof fin === 'undefined') return;

  const channelName = resolveChannelHubName(opts.channelName);
  const bundle = await ensurePlatformReady(opts.bootstrap);
  await bundle.catalogReady;
  const { client } = bundle;

  const provider = await fin.InterApplicationBus.Channel.create(channelName);

  provider.register(CHANNEL_HUB_ACTIONS.PING, async () =>
    safe(async () => 'pong' as const),
  );

  provider.register(CHANNEL_HUB_ACTIONS.ATTACH, async (payload: ChannelHubAttachRequest) =>
    safe(async (): Promise<ChannelHubAttachResult> => {
      const providerId = payload?.providerId?.trim();
      if (!providerId) {
        throw new Error('attach requires providerId');
      }
      const subscriptionId = crypto.randomUUID();
      const handle = client.subscribe<Record<string, unknown>>(
        providerId,
        undefined,
        payload.extra ? { extra: payload.extra } : {},
      );
      const slot: HubSlot = { subscriptionId, providerId, handle };
      slots.set(subscriptionId, slot);
      wireSlot(provider, slot);

      const snapshot = await handle.snapshot;
      const row = await client.getProviderConfig(providerId);
      if (!row?.config) {
        throw new Error(`No catalog config for providerId=${providerId}`);
      }
      return {
        subscriptionId,
        config: row.config,
        snapshot: snapshot as readonly Record<string, unknown>[],
        status: 'ready' as const,
      };
    }),
  );

  provider.register(CHANNEL_HUB_ACTIONS.DETACH, async (payload: ChannelHubSubscriptionRequest) =>
    safe(async () => {
      const slot = slots.get(payload?.subscriptionId ?? '');
      if (slot) {
        slot.handle.unsubscribe();
        slots.delete(slot.subscriptionId);
      }
      return null;
    }),
  );

  provider.register(CHANNEL_HUB_ACTIONS.REFRESH, async (payload: ChannelHubSubscriptionRequest) =>
    safe(async (): Promise<ChannelHubRefreshResult> => {
      const slot = slots.get(payload?.subscriptionId ?? '');
      if (!slot) {
        throw new Error('Unknown subscriptionId');
      }
      const snapshot = await slot.handle.refresh();
      return { snapshot: snapshot as readonly Record<string, unknown>[] };
    }),
  );

  provider.register(CHANNEL_HUB_ACTIONS.RESTART, async (payload: ChannelHubRestartRequest) =>
    safe(async (): Promise<ChannelHubAttachResult> => {
      const existing = slots.get(payload?.subscriptionId ?? '');
      if (existing) {
        existing.handle.unsubscribe();
        slots.delete(existing.subscriptionId);
      }
      const providerId = existing?.providerId;
      if (!providerId) {
        throw new Error('restart requires an active subscription');
      }
      const subscriptionId = crypto.randomUUID();
      const handle = client.subscribe<Record<string, unknown>>(
        providerId,
        undefined,
        payload.extra ? { extra: payload.extra } : {},
      );
      const slot: HubSlot = { subscriptionId, providerId, handle };
      slots.set(subscriptionId, slot);
      wireSlot(provider, slot);
      const snapshot = await handle.snapshot;
      const row = await client.getProviderConfig(providerId);
      if (!row?.config) {
        throw new Error(`No catalog config for providerId=${providerId}`);
      }
      return {
        subscriptionId,
        config: row.config,
        snapshot: snapshot as readonly Record<string, unknown>[],
        status: 'ready' as const,
      };
    }),
  );

  installed = true;
  // eslint-disable-next-line no-console
  console.log(`[channel-data-hub] installed channel '${channelName}'`);
}
