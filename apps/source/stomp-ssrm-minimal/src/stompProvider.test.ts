import { describe, expect, it } from 'vitest';
import {
  buildStompSsrmConfig,
  DEFAULT_LIVE_RATE,
  liveRateFromLocation,
  STOMP_SSRM_PROVIDER_ID,
  stompSsrmProviderDraft,
} from './stompProvider.js';

// `DataProviderConfig.config` is the union of every provider shape; this app
// only ever writes the stomp-ssrm one, and `buildStompSsrmConfig` is its
// declared type. Narrowing once here keeps each assertion reading the field
// it means rather than repeating a cast.
const config = stompSsrmProviderDraft.config as ReturnType<typeof buildStompSsrmConfig>;

describe('stompProvider', () => {
  it('seeds a stomp-ssrm catalog row on the same wire as CSRM STOMP', () => {
    expect(STOMP_SSRM_PROVIDER_ID).toBe('stomp-ssrm-minimal:positions');
    expect(config.providerType).toBe('stomp-ssrm');
    expect(config.websocketUrl).toBe('ws://localhost:8081');
    expect(config.listenerTopic).toBe('/snapshot/positions/TRADER001');
    expect(config.keyColumn).toBe('positionId');
    expect(config.blockSize).toBe(200);
  });

  it('declares no searchColumns so the quick search covers every text column', () => {
    expect(config.searchColumns).toBeUndefined();
  });

  it('carries a dateString maturity column and editable columns for paste checks', () => {
    const cols = config.columnDefinitions ?? [];
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
