import { describe, expect, it } from 'vitest';
import type {
  TransportConfig,
  StompProviderConfig,
  StompSsrmProviderConfig,
} from '@wellsfargo-starui/types';
import {
  STOMP_HISTORICAL_PROVIDER_ID,
  STOMP_LIVE_PROVIDER_ID,
  STOMP_PROVIDER_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
  stompHistoricalProviderDraft,
  stompProviderDraft,
  stompSsrmProviderDraft,
} from './stompProvider.js';

/** Narrows the catalog row's TransportConfig union to the stomp shape. */
function asStompConfig(config: TransportConfig): StompProviderConfig {
  if (config.providerType !== 'stomp') {
    throw new Error(`expected a stomp provider config, got ${config.providerType}`);
  }
  return config;
}

const liveConfig = asStompConfig(stompProviderDraft.config);
const historicalConfig = asStompConfig(stompHistoricalProviderDraft.config);

describe('stompProvider', () => {
  it('exports stable provider ids and cfg version', () => {
    expect(STOMP_LIVE_PROVIDER_ID).toBe('stomp-marketsgrid-minimal:positions-live');
    expect(STOMP_HISTORICAL_PROVIDER_ID).toBe('stomp-marketsgrid-minimal:positions-historical');
    expect(STOMP_PROVIDER_CFG_VERSION).toBe(5);
  });

  it('defines live provider draft for catalog seeding', () => {
    expect(stompProviderDraft).toMatchObject({
      providerId: STOMP_LIVE_PROVIDER_ID,
      name: 'STOMP Positions',
      providerType: 'stomp',
      userId: 'dev1',
      public: false,
    });
    expect(stompProviderDraft.config.providerType).toBe('stomp');
    expect(liveConfig.websocketUrl).toBe('ws://localhost:8081');
    expect(liveConfig.listenerTopic).toBe('/snapshot/positions/TRADER001');
    expect(liveConfig.requestMessage).toBe('/snapshot/positions/TRADER001/1000/50');
    expect(liveConfig.keyColumn).toBe('positionId');
    expect(liveConfig.conflateByKey).toBe('positionId');
  });

  it('defines historical provider draft with date-templated destinations', () => {
    expect(stompHistoricalProviderDraft).toMatchObject({
      providerId: STOMP_HISTORICAL_PROVIDER_ID,
      name: 'STOMP Positions (Historical)',
      providerType: 'stomp',
    });
    expect(historicalConfig.listenerTopic).toBe(
      '/snapshot/positions/TRADER001/{{positions.asOfDate}}',
    );
    expect(historicalConfig.requestMessage).toBe(
      '/snapshot/positions/TRADER001/{{positions.asOfDate}}/50',
    );
  });

  it('shares column definitions and live tuning between live and historical configs', () => {
    expect(historicalConfig.columnDefinitions).toEqual(liveConfig.columnDefinitions);
    expect(historicalConfig.throttleMs).toBe(100);
    expect(historicalConfig.snapshotChunkSize).toBe(1000);
    expect(liveConfig.columnDefinitions?.length).toBeGreaterThan(20);
  });

  it('defines stomp-ssrm draft with same live wire and blockSize', () => {
    expect(stompSsrmProviderDraft).toMatchObject({
      providerId: STOMP_SSRM_PROVIDER_ID,
      name: 'STOMP Positions (SSRM)',
      providerType: 'stomp-ssrm',
    });
    const ssrm = stompSsrmProviderDraft.config as StompSsrmProviderConfig;
    expect(ssrm.providerType).toBe('stomp-ssrm');
    expect(ssrm.listenerTopic).toBe(liveConfig.listenerTopic);
    expect(ssrm.blockSize).toBe(100);
  });
});
