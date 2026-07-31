import { describe, expect, it } from 'vitest';
import { FEATURE_GUIDES, BASE_PROPS, getFeatureGuide } from './featureGuides';
import { LAB_CATEGORIES } from './categories';

// Every real tab id that App.tsx renders, excluding the synthetic `home`.
const TAB_IDS = [
  'overview', 'formatting', 'visual-excel', 'renderers', 'toolbar',
  'groups', 'calc', 'conditional', 'filters', 'live', 'alerts',
  'editing', 'bulk-update', 'plus-minus', 'shortcuts', 'profiles',
];

describe('FEATURE_GUIDES registry', () => {
  it('has a guide for every tab id', () => {
    for (const id of TAB_IDS) {
      expect(getFeatureGuide(id), `missing guide: ${id}`).toBeDefined();
    }
  });

  it('every guide has non-empty summary, whatWhy, and >=1 try step', () => {
    for (const id of TAB_IDS) {
      const g = getFeatureGuide(id)!;
      expect(g.summary.length, `${id}.summary`).toBeGreaterThan(0);
      expect(g.whatWhy.length, `${id}.whatWhy`).toBeGreaterThan(0);
      expect(g.trySteps.length, `${id}.trySteps`).toBeGreaterThan(0);
    }
  });

  it('every guide category exists in LAB_CATEGORIES', () => {
    const known = new Set(LAB_CATEGORIES.map((c) => c.id));
    for (const id of TAB_IDS) {
      expect(known.has(getFeatureGuide(id)!.category), `${id}.category`).toBe(true);
    }
  });

  it('every guide id matches its registry key', () => {
    for (const [key, g] of Object.entries(FEATURE_GUIDES)) {
      expect(g.id).toBe(key);
    }
  });

  it('BASE_PROPS covers the universal mount props', () => {
    const names = BASE_PROPS.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(['gridId', 'rowData', 'columnDefs', 'rowIdField', 'storage']),
    );
  });
});
