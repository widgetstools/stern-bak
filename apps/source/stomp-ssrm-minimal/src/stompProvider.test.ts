import { describe, expect, it } from 'vitest';
import {
  STOMP_SSRM_PROVIDER_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
  stompSsrmProviderDraft,
} from './stompProvider.js';

describe('stompProvider', () => {
  it('seeds a stomp-ssrm catalog row on the same wire as CSRM STOMP', () => {
    expect(STOMP_SSRM_PROVIDER_ID).toBe('stomp-ssrm-minimal:positions');
    expect(STOMP_SSRM_PROVIDER_CFG_VERSION).toBe(1);
    expect(stompSsrmProviderDraft.config.providerType).toBe('stomp-ssrm');
    expect(stompSsrmProviderDraft.config.websocketUrl).toBe('ws://localhost:8081');
    expect(stompSsrmProviderDraft.config.listenerTopic).toBe('/snapshot/positions/TRADER001');
    expect(stompSsrmProviderDraft.config.keyColumn).toBe('positionId');
    expect(stompSsrmProviderDraft.config.blockSize).toBe(200);
  });
});
