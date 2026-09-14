import { describe, expect, it } from 'vitest';
import {
  applyViewProcessAffinityPolicy,
  applyViewProcessAffinityPolicyToLayout,
  LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX,
  stripLegacyViewIsolationAffinity,
  stripLegacyViewIsolationFromLayout,
  disableBackgroundThrottling,
  disableBackgroundThrottlingInLayout,
} from './stripLegacyViewIsolationAffinity';

describe('stripLegacyViewIsolationAffinity', () => {
  it('replaces a legacy view-iso affinity with the shared group', () => {
    const opts = {
      name: 'blotter-1',
      processAffinity: `${LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX}e0c85b5d-uuid`,
    };
    stripLegacyViewIsolationAffinity(opts, 'star-demo');
    expect(opts.processAffinity).toBe('star-demo');
  });

  it('deletes the legacy affinity when no shared group is supplied', () => {
    const opts: { processAffinity?: string } = {
      processAffinity: `${LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX}abc`,
    };
    stripLegacyViewIsolationAffinity(opts);
    expect('processAffinity' in opts).toBe(false);
  });

  it('leaves non-legacy affinities untouched — seed and deliberate groupings survive', () => {
    const seed = { processAffinity: 'star-demo' };
    stripLegacyViewIsolationAffinity(seed, 'other-app');
    expect(seed.processAffinity).toBe('star-demo');

    const none: { processAffinity?: string } = {};
    stripLegacyViewIsolationAffinity(none, 'app');
    expect('processAffinity' in none).toBe(false);
  });
});

describe('stripLegacyViewIsolationFromLayout', () => {
  it('cleans every contaminated view componentState in a snapshot layout tree', () => {
    const layout = {
      content: [
        {
          type: 'stack',
          content: [
            {
              type: 'component',
              componentState: {
                componentName: 'view',
                name: 'v1',
                processAffinity: `${LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX}aaa`,
              },
            },
            {
              type: 'component',
              componentState: {
                componentName: 'view',
                name: 'v2',
                processAffinity: 'star-demo', // pre-experiment value: keep
              },
            },
          ],
        },
      ],
    };

    stripLegacyViewIsolationFromLayout(layout, 'star-demo');

    const [a, b] = layout.content[0]!.content.map(
      (c) => c.componentState.processAffinity,
    );
    expect(a).toBe('star-demo');
    expect(b).toBe('star-demo');
  });

  it('tolerates null / non-layout shapes', () => {
    expect(() => stripLegacyViewIsolationFromLayout(null)).not.toThrow();
    expect(() => stripLegacyViewIsolationFromLayout('str')).not.toThrow();
    const notAView = { type: 'stack', settings: { hasHeaders: true } };
    stripLegacyViewIsolationFromLayout(notAView, 'x');
    expect('processAffinity' in notAView).toBe(false);
  });
});

describe('disableBackgroundThrottling', () => {
  it('forces false, overriding a persisted true from a pre-policy save', () => {
    expect(disableBackgroundThrottling({ backgroundThrottling: true }).backgroundThrottling).toBe(false);
    expect(disableBackgroundThrottling({}).backgroundThrottling).toBe(false);
  });

  it('layout walk overrides persisted true on every view componentState', () => {
    const layout = {
      content: [
        {
          type: 'stack',
          content: [
            {
              type: 'component',
              componentState: {
                componentName: 'view',
                name: 'v1',
                backgroundThrottling: true, // resolved+persisted pre-policy
              },
            },
            {
              type: 'component',
              componentState: { componentName: 'view', name: 'v2' },
            },
          ],
        },
      ],
    };
    disableBackgroundThrottlingInLayout(layout);
    const [a, b] = layout.content[0]!.content.map(
      (c) => (c.componentState as { backgroundThrottling?: boolean }).backgroundThrottling,
    );
    expect(a).toBe(false);
    expect(b).toBe(false);
  });

  it('layout walk tolerates null / non-layout shapes', () => {
    expect(() => disableBackgroundThrottlingInLayout(null)).not.toThrow();
    expect(() => disableBackgroundThrottlingInLayout('str')).not.toThrow();
  });
});

describe('applyViewProcessAffinityPolicy — manifest viewProcessAffinityStrategy', () => {
  it('"different": strips the shared group AND legacy values so the strategy governs', () => {
    expect(applyViewProcessAffinityPolicy({ processAffinity: 'star-demo' }, { strategy: 'different', sharedAffinity: 'star-demo' }))
      .toEqual({});
    expect(applyViewProcessAffinityPolicy({ processAffinity: 'view-iso-x' }, { strategy: 'different' }))
      .toEqual({});
    expect(applyViewProcessAffinityPolicy({ url: 'u' }, { strategy: 'different' })).toEqual({ url: 'u' });
  });

  it('no strategy: falls back to the legacy cleanup (shared group kept, legacy normalised)', () => {
    expect(applyViewProcessAffinityPolicy({ processAffinity: 'star-demo' }, { sharedAffinity: 'star-demo' }))
      .toEqual({ processAffinity: 'star-demo' });
    expect(applyViewProcessAffinityPolicy({ processAffinity: 'view-iso-x' }, { sharedAffinity: 'star-demo' }))
      .toEqual({ processAffinity: 'star-demo' });
  });

  it('"same": behaves like no strategy for explicit tags (OpenFin groups by origin anyway)', () => {
    expect(applyViewProcessAffinityPolicy({ processAffinity: 'PA1' }, { strategy: 'same' }))
      .toEqual({ processAffinity: 'PA1' });
  });

  it('layout walk under "different" clears every persisted affinity in the tree', () => {
    const layout = {
      content: [{
        type: 'stack',
        content: [
          { componentName: 'view', componentState: { name: 'a', processAffinity: 'star-demo' } },
          { componentName: 'view', componentState: { name: 'b', processAffinity: 'view-iso-old' } },
          { componentName: 'view', componentState: { name: 'c' } },
        ],
      }],
    };
    applyViewProcessAffinityPolicyToLayout(layout, { strategy: 'different', sharedAffinity: 'star-demo' });
    const states = layout.content[0].content.map((c) => c.componentState as Record<string, unknown>);
    expect(states.every((s) => !('processAffinity' in s))).toBe(true);
    expect(states.map((s) => s.name)).toEqual(['a', 'b', 'c']);
    applyViewProcessAffinityPolicyToLayout(null, { strategy: 'different' });
  });

  it('layout walk without a strategy is the legacy walk', () => {
    const layout = { content: [{ componentName: 'view', componentState: { processAffinity: 'view-iso-old' } }] };
    applyViewProcessAffinityPolicyToLayout(layout, { sharedAffinity: 'star-demo' });
    expect((layout.content[0].componentState as { processAffinity?: string }).processAffinity).toBe('star-demo');
  });

  // Measured 2026-09-13 (OpenFin 43.142.101.2): under "different" the runtime
  // stamps every view with a bare uuid affinity and getSnapshot() persists it,
  // so a layout saved under isolation restored with the key removed still came
  // up as one renderer per view. Switching the strategy off must clear those.
  describe('runtime-assigned uuid affinities persisted under "different"', () => {
    const uuid = '37a07fd0-402e-4da3-a1f0-bc6cb4110af9';

    it('no strategy: a uuid affinity is normalised to the shared group', () => {
      expect(applyViewProcessAffinityPolicy({ processAffinity: uuid }, { sharedAffinity: 'star-demo' }))
        .toEqual({ processAffinity: 'star-demo' });
      expect(applyViewProcessAffinityPolicy({ processAffinity: uuid.toUpperCase() }, { sharedAffinity: 'star-demo' }))
        .toEqual({ processAffinity: 'star-demo' });
    });

    it('no strategy and no shared group: the uuid affinity is dropped', () => {
      expect(applyViewProcessAffinityPolicy({ processAffinity: uuid }, {})).toEqual({});
    });

    it('"same": the uuid affinity is normalised too', () => {
      expect(applyViewProcessAffinityPolicy({ processAffinity: uuid }, { strategy: 'same', sharedAffinity: 'app' }))
        .toEqual({ processAffinity: 'app' });
    });

    it('readable explicit tags are still left alone without a strategy', () => {
      expect(applyViewProcessAffinityPolicy({ processAffinity: 'trading-group' }, { sharedAffinity: 'star-demo' }))
        .toEqual({ processAffinity: 'trading-group' });
      expect(stripLegacyViewIsolationAffinity({ processAffinity: 'not-a-uuid-1234' }, 'star-demo'))
        .toEqual({ processAffinity: 'not-a-uuid-1234' });
    });

    it('layout walk without a strategy clears uuid affinities in every componentState', () => {
      const layout = {
        content: [{
          type: 'stack',
          content: [
            { componentName: 'view', componentState: { name: 'a', processAffinity: uuid } },
            { componentName: 'view', componentState: { name: 'b', processAffinity: '8dda95f3-ec47-43e5-b0a0-06f5fb5c37c0' } },
            { componentName: 'view', componentState: { name: 'c', processAffinity: 'star-demo' } },
          ],
        }],
      };
      applyViewProcessAffinityPolicyToLayout(layout, { sharedAffinity: 'star-demo' });
      const states = layout.content[0].content.map((c) => c.componentState as { processAffinity?: string });
      expect(states.map((s) => s.processAffinity)).toEqual(['star-demo', 'star-demo', 'star-demo']);
    });
  });
});
