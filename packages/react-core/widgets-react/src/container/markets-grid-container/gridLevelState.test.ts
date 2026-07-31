import { describe, expect, it } from 'vitest';
import { normalizeGridLevelData, serializeGridLevelData } from './gridLevelState.js';

describe('normalizeGridLevelData', () => {
  it('migrates legacy flat provider selection', () => {
    const state = normalizeGridLevelData({
      liveProviderId: 'p1',
      historicalProviderId: 'p2',
      mode: 'live',
      caption: 'My blotter',
    });
    expect(state).toEqual({
      v: 1,
      provider: {
        liveProviderId: 'p1',
        historicalProviderId: 'p2',
        mode: 'live',
      },
      caption: 'My blotter',
    });
  });

  it('reads v1 envelope with eventBindings', () => {
    const state = normalizeGridLevelData({
      v: 1,
      provider: { liveProviderId: 'a', historicalProviderId: null, mode: 'live' },
      eventBindings: { 'profile:saved': ['log-save'] },
    });
    expect(state.eventBindings).toEqual({ 'profile:saved': ['log-save'] });
  });

  it('coerces multi-handler legacy bindings to one handler per event', () => {
    const state = normalizeGridLevelData({
      v: 1,
      provider: { liveProviderId: 'a', historicalProviderId: null, mode: 'live' },
      eventBindings: { 'grid:ready': ['a', 'b'] },
    });
    expect(state.eventBindings).toEqual({ 'grid:ready': ['a'] });
  });

  it('serialize round-trips provider and bindings', () => {
    const raw = serializeGridLevelData({
      v: 1,
      provider: { liveProviderId: 'x', historicalProviderId: null, mode: 'historical' },
      eventBindings: { 'grid:ready': ['a'] },
    });
    expect(normalizeGridLevelData(raw).eventBindings).toEqual({ 'grid:ready': ['a'] });
  });
});
