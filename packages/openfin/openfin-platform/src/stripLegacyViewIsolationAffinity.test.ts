import { describe, expect, it } from 'vitest';
import {
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
