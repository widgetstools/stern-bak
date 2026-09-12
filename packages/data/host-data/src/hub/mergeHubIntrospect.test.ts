import { describe, expect, it } from 'vitest';
import type { HubIntrospectSnapshot } from '../runtime/protocol.js';
import { mergeHubIntrospect } from './mergeHubIntrospect.js';

const data: HubIntrospectSnapshot = {
  connectedPorts: 3,
  catalogReady: false,
  catalogProviderCount: 0,
  runningProviderCount: 1,
  providers: [
    { providerId: 'p1', providerType: 'stomp', running: true, status: 'ready', rowCount: 20_000 },
  ],
  appData: { listenerCount: 0, rows: [] },
};

const platform: HubIntrospectSnapshot = {
  connectedPorts: 4,
  catalogReady: true,
  catalogProviderCount: 3,
  runningProviderCount: 0,
  providers: [
    { providerId: 'p1', name: 'Positions', providerType: 'stomp', running: false },
    { providerId: 'p2', name: 'Trades', providerType: 'rest', running: false },
  ],
  appData: { listenerCount: 2, rows: [{ configId: 'ad-1', name: 'positions', keyCount: 1, values: { asOfDate: '2026-09-12' } }] },
};

describe('mergeHubIntrospect', () => {
  it('returns the data snapshot untouched when there is no platform answer', () => {
    expect(mergeHubIntrospect(data, null)).toBe(data);
  });

  it('takes providers + ports from the data hub and catalog + AppData from the platform host', () => {
    const merged = mergeHubIntrospect(data, platform);
    expect(merged.connectedPorts).toBe(3);
    expect(merged.runningProviderCount).toBe(1);
    expect(merged.catalogReady).toBe(true);
    expect(merged.catalogProviderCount).toBe(3);
    expect(merged.appData).toBe(platform.appData);
  });

  it('names running rows from the catalog and appends idle catalog rows', () => {
    const merged = mergeHubIntrospect(data, platform);
    expect(merged.providers).toEqual([
      expect.objectContaining({ providerId: 'p1', name: 'Positions', running: true, rowCount: 20_000 }),
      expect.objectContaining({ providerId: 'p2', name: 'Trades', running: false }),
    ]);
  });

  it('keeps a name the data hub already reported', () => {
    const named = { ...data, providers: [{ ...data.providers[0], name: 'Live' }] };
    expect(mergeHubIntrospect(named, platform).providers[0].name).toBe('Live');
  });
});
