import { describe, expect, it } from 'vitest';
import { FEATURE_GUIDES, FEATURE_GUIDE_IDS, featureGuideForModule, findFeatureGuide } from './featureGuides';
import { MODULE_COLLECTIONS, GRID_MODULES } from './moduleCollections';

describe('featureGuideForModule', () => {
  it('resolves a module whose id IS a guide id', () => {
    expect(featureGuideForModule('conditional-styling')).toBe('conditional-styling');
    expect(featureGuideForModule('general-settings')).toBe('general-settings');
  });

  /**
   * The regression this exists for: `hasFeatureGuide` used to be a strict id
   * match, so every module documented by a guide under a DIFFERENT id reported
   * "no guide" and became undiscoverable to the model.
   */
  it('resolves the five editing modules to the guide that actually documents them', () => {
    for (const moduleId of ['smart-edit', 'bulk-update', 'plus-minus', 'shortcuts', 'data-change-history', 'visual-excel']) {
      expect(featureGuideForModule(moduleId)).toBe('editing');
    }
  });

  it('returns undefined for a module no guide covers', () => {
    expect(featureGuideForModule('toolbar-visibility')).toBeUndefined();
    expect(featureGuideForModule('not-a-module')).toBeUndefined();
  });

  it('only ever names a guide that actually exists', () => {
    for (const m of GRID_MODULES) {
      const guideId = featureGuideForModule(m.id);
      if (guideId !== undefined) expect(findFeatureGuide(guideId)).toBeDefined();
    }
  });

  it('never claims to cover a module id that is not registered', () => {
    const moduleIds = new Set(GRID_MODULES.map((m) => m.id));
    for (const guide of FEATURE_GUIDES) {
      for (const covered of guide.covers ?? []) {
        expect(moduleIds.has(covered)).toBe(true);
      }
    }
  });
});

describe('module-items guide stays in step with MODULE_COLLECTIONS', () => {
  /**
   * The table in the `module-items` guide is the model's map from a module to
   * its addressable collection. It drifted to 7 of 10 entries once already —
   * and a missing row doesn't fail loudly, it just means the model never
   * discovers that it can edit those items at all.
   */
  it('names every collection-bearing module in its table', () => {
    const detail = findFeatureGuide('module-items')!.detail;
    for (const spec of MODULE_COLLECTIONS) {
      if (spec.readOnly) continue;
      expect(
        detail.includes(spec.moduleId),
        `module-items guide is missing "${spec.moduleId}" (collection "${spec.collection}")`,
      ).toBe(true);
      expect(
        detail.includes(spec.collection),
        `module-items guide is missing collection "${spec.collection}"`,
      ).toBe(true);
    }
  });

  /**
   * plus-minus, shortcuts and alerts carry BOTH a settings object and a
   * collection. The guide used to list the first two as settings-only, which
   * is worse than an omission — it actively tells the model their items
   * cannot be edited.
   */
  it('does not describe a collection-bearing module as settings-only', () => {
    const detail = findFeatureGuide('module-items')!.detail;
    const settingsOnlyLine = detail
      .split('\n')
      .find((l) => l.startsWith('general-settings,') || l.includes('That covers'));
    expect(settingsOnlyLine).toBeDefined();
    const collectionModules = new Set(MODULE_COLLECTIONS.map((c) => c.moduleId));
    const tail = detail.slice(detail.indexOf('That covers'));
    for (const id of ['plus-minus', 'shortcuts']) {
      expect(collectionModules.has(id)).toBe(true);
      // Named in the "both" note, not in the settings-only sentence.
      const settingsSentence = tail.slice(0, tail.indexOf('.') + 1);
      expect(settingsSentence.includes(id)).toBe(false);
    }
  });
});

describe('guide registry', () => {
  it('has unique ids', () => {
    expect(new Set(FEATURE_GUIDE_IDS).size).toBe(FEATURE_GUIDE_IDS.length);
  });

  it('gives every guide a non-empty title, summary and detail', () => {
    for (const g of FEATURE_GUIDES) {
      expect(g.title.length, g.id).toBeGreaterThan(0);
      expect(g.summary.length, g.id).toBeGreaterThan(0);
      expect(g.detail.length, g.id).toBeGreaterThan(0);
    }
  });
});
