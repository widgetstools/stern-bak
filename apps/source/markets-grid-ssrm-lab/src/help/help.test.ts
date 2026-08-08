import { describe, expect, it } from 'vitest';
import { HELP } from './index';

describe('help index', () => {
  it('loads markdown help for every feature tab', () => {
    const keys = [
      'overview',
      'formatting',
      'renderers',
      'formatterToolbar',
      'columnGroups',
      'calculatedColumns',
      'conditionalStyling',
      'liveUpdates',
      'profiles',
      'alerts',
      'quickFilters',
      'smartEdit',
      'editHistory',
      'bulkUpdate',
      'editing',
      'plusMinus',
      'shortcuts',
      'visualExcel',
    ] as const;

    for (const key of keys) {
      expect(typeof HELP[key]).toBe('string');
      expect(HELP[key].length).toBeGreaterThan(20);
    }
  });
});
