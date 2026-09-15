import { describe, expect, it } from 'vitest';
import {
  buildLabSsrmConfig,
  DEFAULT_STREAM,
  labSsrmProviderDraft,
  streamRestartExtra,
} from './labSsrmProvider';

describe('labSsrmProvider', () => {
  it('seeds a mock-ssrm row keyed by id with the engine schema attached', () => {
    const cfg = buildLabSsrmConfig();
    expect(cfg.providerType).toBe('mock-ssrm');
    expect(cfg.dataType).toBe('positions');
    expect(cfg.keyColumn).toBe('id');
    expect(cfg.columnDefinitions?.length).toBeGreaterThan(40);
    expect(labSsrmProviderDraft.providerId).toBe('markets-grid-lab-ssrm:positions');
  });

  it('declares no searchColumns so quick search covers every text column', () => {
    expect(buildLabSsrmConfig().searchColumns).toBeUndefined();
  });

  it('returns no restart extra for default stream options — a fresh provider must not restart', () => {
    expect(streamRestartExtra(undefined)).toBeNull();
    expect(streamRestartExtra({ ...DEFAULT_STREAM })).toBeNull();
  });

  it('builds a restart overlay when a tab runs hotter than the default', () => {
    expect(streamRestartExtra({ rowCount: 2000, updateIntervalMs: 100 })).toEqual({
      rowCount: 2000,
      updateIntervalMs: 100,
      enableUpdates: true,
    });
  });
});

describe('streamRestartExtra — partial overlays', () => {
  it('fills each unset option from the default rather than dropping it', () => {
    // The hub replaces the whole extra, so an overlay missing `rowCount`
    // would restart the mock transport with an unspecified book size.
    expect(streamRestartExtra({ updateIntervalMs: 100 })).toEqual({
      rowCount: DEFAULT_STREAM.rowCount,
      updateIntervalMs: 100,
      enableUpdates: true,
    });
    expect(streamRestartExtra({ rowCount: 100 })).toEqual({
      rowCount: 100,
      updateIntervalMs: DEFAULT_STREAM.updateIntervalMs,
      enableUpdates: true,
    });
  });

  it('treats a paused stream as a real difference from the default', () => {
    expect(streamRestartExtra({ enableUpdates: false })).toEqual({
      rowCount: DEFAULT_STREAM.rowCount,
      updateIntervalMs: DEFAULT_STREAM.updateIntervalMs,
      enableUpdates: false,
    });
  });

  it('returns null for an options object that only restates the defaults', () => {
    expect(streamRestartExtra({ rowCount: DEFAULT_STREAM.rowCount })).toBeNull();
    expect(streamRestartExtra({})).toBeNull();
  });
});
