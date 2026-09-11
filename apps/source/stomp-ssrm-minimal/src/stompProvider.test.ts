import { describe, expect, it } from 'vitest';
import {
  buildStompSsrmConfig,
  DEFAULT_LIVE_RATE,
  liveRateFromLocation,
  STOMP_SSRM_PROVIDER_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
  stompSsrmProviderDraft,
} from './stompProvider.js';

describe('stompProvider', () => {
  it('seeds a stomp-ssrm catalog row on the same wire as CSRM STOMP', () => {
    expect(STOMP_SSRM_PROVIDER_ID).toBe('stomp-ssrm-minimal:positions');
    expect(STOMP_SSRM_PROVIDER_CFG_VERSION).toBe(3);
    expect(stompSsrmProviderDraft.config.providerType).toBe('stomp-ssrm');
    expect(stompSsrmProviderDraft.config.websocketUrl).toBe('ws://localhost:8081');
    expect(stompSsrmProviderDraft.config.listenerTopic).toBe('/snapshot/positions/TRADER001');
    expect(stompSsrmProviderDraft.config.keyColumn).toBe('positionId');
    expect(stompSsrmProviderDraft.config.blockSize).toBe(200);
  });

  it('declares no searchColumns so the quick search covers every text column', () => {
    expect(stompSsrmProviderDraft.config.searchColumns).toBeUndefined();
  });

  it('carries a dateString maturity column and editable columns for paste checks', () => {
    const cols = stompSsrmProviderDraft.config.columnDefinitions ?? [];
    expect(cols.find((c) => c.field === 'maturityDate')).toMatchObject({ cellDataType: 'dateString', filter: 'agDateColumnFilter' });
    expect(cols.find((c) => c.field === 'trader')).toMatchObject({ editable: true });
    expect(cols.find((c) => c.field === 'marketValue')).toMatchObject({ editable: true, cellDataType: 'number' });
  });

  it('reads the live rate from the URL and clamps it', () => {
    expect(liveRateFromLocation('')).toBe(DEFAULT_LIVE_RATE);
    expect(liveRateFromLocation('?rate=10000')).toBe(10_000);
    expect(liveRateFromLocation('?rate=abc')).toBe(DEFAULT_LIVE_RATE);
    expect(liveRateFromLocation('?rate=-5')).toBe(DEFAULT_LIVE_RATE);
    expect(liveRateFromLocation('?rate=999999')).toBe(60_000);
    expect(buildStompSsrmConfig(2500).requestMessage).toBe('/snapshot/positions/TRADER001/2500/50');
  });
});
