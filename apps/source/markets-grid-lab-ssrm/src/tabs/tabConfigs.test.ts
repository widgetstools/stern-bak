import { describe, expect, it } from 'vitest';
import { SSRM_TABS } from './tabConfigs';

describe('SSRM tab roster', () => {
  it('mirrors the lab tab ids in the lab order (profiles is a custom component)', () => {
    expect(SSRM_TABS.map((t) => t.id)).toEqual([
      'overview', 'formatting', 'visual-excel', 'renderers', 'toolbar',
      'groups', 'calc', 'conditional', 'filters', 'live', 'alerts',
      'editing', 'bulk-update', 'plus-minus', 'shortcuts',
    ]);
  });

  it('binds each entry to the lab config with the same tabId', () => {
    for (const tab of SSRM_TABS) expect(tab.config.tabId).toBe(tab.id);
  });
});
