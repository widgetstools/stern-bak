import { describe, expect, it, vi } from 'vitest';
import { CHANNEL_HUB_ACTIONS } from '../channel/channelHubProtocol.js';
import { ChannelBridgeClientAdapter } from './ChannelBridgeClientAdapter.js';

function mockClient() {
  const handlers = new Map<string, (payload: unknown) => unknown>();
  return {
    dispatch: vi.fn(async (action: string, payload: unknown) => {
      if (action === CHANNEL_HUB_ACTIONS.ATTACH) {
        return {
          ok: true,
          data: {
            subscriptionId: 'sub-1',
            config: { providerType: 'stomp', websocketUrl: 'ws://x', listenerTopic: '/t' },
            snapshot: [{ id: '1' }],
            status: 'ready',
          },
        };
      }
      if (action === CHANNEL_HUB_ACTIONS.DETACH) {
        return { ok: true, data: null };
      }
      return { ok: false, error: 'unexpected' };
    }),
    register: vi.fn((action: string, fn: (payload: unknown) => unknown) => {
      handlers.set(action, fn);
      return true;
    }),
    disconnect: vi.fn(async () => undefined),
    emit(action: string, payload: unknown) {
      handlers.get(action)?.(payload);
    },
  };
}

describe('ChannelBridgeClientAdapter', () => {
  it('attach loads snapshot and registers for hub events', async () => {
    const client = mockClient();
    const connect = vi.fn(async () => client);

    const adapter = new ChannelBridgeClientAdapter({
      providerId: 'bridge-1',
      connect,
      inlineCfg: {
        providerType: 'iab-channel-bridge',
        upstreamProviderId: 'stomp-live',
      },
    });

    const snapshots: unknown[] = [];
    adapter.onSnapshotData((rows) => snapshots.push(rows));

    await adapter.start();

    expect(connect).toHaveBeenCalledWith('marketsui-data-hub');
    expect(adapter.getData()).toEqual([{ id: '1' }]);
    expect(snapshots).toHaveLength(1);

    client.emit(CHANNEL_HUB_ACTIONS.HUB_EVENT, {
      subscriptionId: 'sub-1',
      type: 'delta',
      rows: [{ id: '2' }],
    });

    const ticks: unknown[] = [];
    adapter.onTick((rows) => ticks.push(rows));
    client.emit(CHANNEL_HUB_ACTIONS.HUB_EVENT, {
      subscriptionId: 'sub-1',
      type: 'delta',
      rows: [{ id: '3' }],
    });
    expect(ticks).toEqual([[{ id: '3' }]]);

    await adapter.stop();
    expect(client.dispatch).toHaveBeenCalledWith(
      CHANNEL_HUB_ACTIONS.DETACH,
      expect.objectContaining({ subscriptionId: 'sub-1' }),
    );
  });
});
