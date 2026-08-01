import { describe, expect, it } from 'vitest';
import { deserializeSmartEditState, INITIAL_SMART_EDIT } from './state.js';

describe('deserializeSmartEditState', () => {
  it('returns defaults for invalid input', () => {
    expect(deserializeSmartEditState(null).settings.enabled).toBe(true);
    expect(deserializeSmartEditState('bad').settings.incrementStep).toBe(1);
  });

  it('merges partial settings', () => {
    const s = deserializeSmartEditState({
      settings: { enabled: false, incrementStep: 5, confirmThreshold: 10 },
    });
    expect(s.settings.enabled).toBe(false);
    expect(s.settings.incrementStep).toBe(5);
    expect(s.settings.confirmThreshold).toBe(10);
    expect(s.settings.magnitudeShortcutsEnabled).toBe(true);
  });

  it('filters invalid enabledOps', () => {
    const s = deserializeSmartEditState({
      settings: { enabledOps: ['multiply', 'invalid', 'set'] },
    });
    expect(s.settings.enabledOps).toEqual(['multiply', 'set']);
  });

  it('falls back when enabledOps empty after filter', () => {
    const s = deserializeSmartEditState({ settings: { enabledOps: ['nope'] } });
    expect(s.settings.enabledOps).toEqual(INITIAL_SMART_EDIT.settings.enabledOps);
  });

  it('rejects invalid incrementStep', () => {
    const s = deserializeSmartEditState({ settings: { incrementStep: -1 } });
    expect(s.settings.incrementStep).toBe(1);
  });
});
