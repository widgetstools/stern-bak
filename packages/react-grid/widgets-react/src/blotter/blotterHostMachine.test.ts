import { describe, expect, it } from 'vitest';
import {
  EMPTY_GRID_KEY,
  blotterGridKey,
  blotterHostLoadingMessage,
  isGridStep,
  resolveBlotterHostStep,
  type BlotterHostFacts,
} from './blotterHostMachine.js';

const ready: BlotterHostFacts = {
  identityReady: true,
  configManagerReady: true,
  storagePending: false,
  gridLevelLoaded: true,
  activeProviderId: 'dp-live',
  providerConfig: { loading: false, present: true, error: false },
  rowIdFieldKey: 'id',
  columnDefsReady: true,
  ssrm: false,
};

describe('resolveBlotterHostStep', () => {
  it('walks identity → storage → selection → config → grid, one gate at a time', () => {
    expect(resolveBlotterHostStep({ ...ready, identityReady: false })).toEqual({ phase: 'identity' });
    expect(resolveBlotterHostStep({ ...ready, configManagerReady: false })).toEqual({ phase: 'storage' });
    expect(resolveBlotterHostStep({ ...ready, storagePending: true })).toEqual({ phase: 'storage' });
    expect(resolveBlotterHostStep({ ...ready, gridLevelLoaded: false })).toEqual({ phase: 'selection' });
    expect(resolveBlotterHostStep({ ...ready, providerConfig: { loading: true, present: false, error: false } }))
      .toEqual({ phase: 'config', providerId: 'dp-live' });
    expect(resolveBlotterHostStep(ready))
      .toEqual({ phase: 'grid', grid: 'data', providerId: 'dp-live', key: 'csrm::dp-live::id', ssrm: false });
  });

  it('earlier gates win even when later facts look ready', () => {
    expect(resolveBlotterHostStep({ ...ready, identityReady: false, configManagerReady: false, gridLevelLoaded: false }))
      .toEqual({ phase: 'identity' });
    expect(resolveBlotterHostStep({ ...ready, gridLevelLoaded: false, activeProviderId: null }))
      .toEqual({ phase: 'selection' });
  });

  it('WORKLOG 20: a chosen provider whose row is neither present nor failed is config, never a grid', () => {
    // The stale render the config hook used to produce: no row, loading:false, no error.
    const stale = { ...ready, providerConfig: { loading: false, present: false, error: false } };
    expect(resolveBlotterHostStep(stale)).toEqual({ phase: 'config', providerId: 'dp-live' });
    for (const loading of [true, false]) {
      const step = resolveBlotterHostStep({ ...ready, providerConfig: { loading, present: false, error: false } });
      expect(isGridStep(step)).toBe(false);
    }
  });

  it('shows the empty grid only when there is definitely nothing to attach', () => {
    expect(resolveBlotterHostStep({ ...ready, activeProviderId: null }))
      .toEqual({ phase: 'grid', grid: 'empty', reason: 'no-provider' });
    expect(resolveBlotterHostStep({ ...ready, providerConfig: { loading: false, present: false, error: true } }))
      .toEqual({ phase: 'grid', grid: 'empty', reason: 'config-error' });
    expect(resolveBlotterHostStep({ ...ready, rowIdFieldKey: null }))
      .toEqual({ phase: 'grid', grid: 'empty', reason: 'config-unusable' });
    expect(resolveBlotterHostStep({ ...ready, columnDefsReady: false }))
      .toEqual({ phase: 'grid', grid: 'empty', reason: 'config-unusable' });
  });

  it('keys the data grid by row model, provider and key column so a switch remounts on purpose', () => {
    expect(blotterGridKey('dp-1', 'a:b', true)).toBe('ssrm::dp-1::a:b');
    expect(resolveBlotterHostStep({ ...ready, ssrm: true, rowIdFieldKey: 'positionId' }))
      .toMatchObject({ grid: 'data', key: 'ssrm::dp-live::positionId', ssrm: true });
    expect(EMPTY_GRID_KEY).toBe('__no_provider__');
  });
});

describe('blotterHostLoadingMessage', () => {
  it('names one loading state per pre-grid phase and none once a grid renders', () => {
    expect(blotterHostLoadingMessage({ phase: 'identity' }, null)).toBe('Connecting to ConfigService…');
    expect(blotterHostLoadingMessage({ phase: 'storage' }, null)).toBe('Connecting to ConfigService…');
    expect(blotterHostLoadingMessage({ phase: 'selection' }, null)).toBe('Loading…');
    expect(blotterHostLoadingMessage({ phase: 'config', providerId: 'x' }, null)).toBe('Loading provider configuration…');
    expect(blotterHostLoadingMessage({ phase: 'config', providerId: 'x' }, 'Positions')).toBe('Loading Positions…');
    expect(blotterHostLoadingMessage(resolveBlotterHostStep(ready), 'Positions')).toBeNull();
    expect(blotterHostLoadingMessage({ phase: 'grid', grid: 'empty', reason: 'no-provider' }, null)).toBeNull();
  });
});
