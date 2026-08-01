import { describe, expect, it } from 'vitest';
import {
  STOMP_HISTORICAL_PROVIDER_ID,
  STOMP_LIVE_PROVIDER_ID,
  STOMP_PROVIDER_CFG_VERSION,
  stompHistoricalProviderDraft,
  stompProviderDraft,
} from './stompProvider.js';

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
    expect(stompProviderDraft.config.websocketUrl).toBe('ws://localhost:8081');
    expect(stompProviderDraft.config.listenerTopic).toBe('/snapshot/positions/TRADER001');
    expect(stompProviderDraft.config.requestMessage).toBe('/snapshot/positions/TRADER001/1000/50');
    expect(stompProviderDraft.config.keyColumn).toBe('positionId');
    expect(stompProviderDraft.config.conflateByKey).toBe('positionId');
  });

  it('defines historical provider draft with date-templated destinations', () => {
    expect(stompHistoricalProviderDraft).toMatchObject({
      providerId: STOMP_HISTORICAL_PROVIDER_ID,
      name: 'STOMP Positions (Historical)',
      providerType: 'stomp',
    });
    expect(stompHistoricalProviderDraft.config.listenerTopic).toBe(
      '/snapshot/positions/TRADER001/{{positions.asOfDate}}',
    );
    expect(stompHistoricalProviderDraft.config.requestMessage).toBe(
      '/snapshot/positions/TRADER001/{{positions.asOfDate}}/50',
    );
  });

  it('shares column definitions and live tuning between live and historical configs', () => {
    expect(stompHistoricalProviderDraft.config.columnDefinitions).toEqual(
      stompProviderDraft.config.columnDefinitions,
    );
    expect(stompHistoricalProviderDraft.config.throttleMs).toBe(100);
    expect(stompHistoricalProviderDraft.config.snapshotChunkSize).toBe(1000);
    expect(stompProviderDraft.config.columnDefinitions?.length).toBeGreaterThan(20);
  });
});
