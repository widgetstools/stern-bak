import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetLoadMarksForTests,
  markConfigReady,
  markHubConnected,
  markPlatformReady,
  markLoadMilestone,
  readLoadMilestone,
  readLoadTimings,
} from './loadMarks.js';

describe('loadMarks', () => {
  afterEach(() => {
    _resetLoadMarksForTests();
  });

  it('stamps a milestone mark readable as ms from timeOrigin', () => {
    expect(readLoadMilestone('config-ready')).toBeUndefined();
    markConfigReady();
    const t = readLoadMilestone('config-ready');
    expect(typeof t).toBe('number');
    expect(t).toBeGreaterThanOrEqual(0);
  });

  it('is idempotent — a milestone marks at most once', () => {
    markConfigReady();
    const first = readLoadMilestone('config-ready');
    markConfigReady();
    expect(readLoadMilestone('config-ready')).toBe(first);
  });

  it('readLoadTimings returns only the milestones marked so far', () => {
    markConfigReady();
    markHubConnected();
    const timings = readLoadTimings();
    expect(Object.keys(timings).sort()).toEqual(['config-ready', 'hub-connected']);
    markPlatformReady();
    expect(readLoadTimings()['platform-ready']).toBeGreaterThanOrEqual(0);
  });

  it('markLoadMilestone accepts any milestone id', () => {
    markLoadMilestone('catalog-ready');
    expect(readLoadMilestone('catalog-ready')).toBeGreaterThanOrEqual(0);
  });

  it('_resetLoadMarksForTests clears the ladder', () => {
    markConfigReady();
    _resetLoadMarksForTests();
    expect(readLoadMilestone('config-ready')).toBeUndefined();
    expect(readLoadTimings()).toEqual({});
  });
});
