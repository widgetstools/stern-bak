import { describe, expect, it } from 'vitest';
import {
  INITIAL_TOOLBAR_VISIBILITY,
  toolbarVisibilityModule,
  TOOLBAR_VISIBILITY_MODULE_ID,
} from './index';

describe('toolbarVisibilityModule', () => {
  it('registers as hidden state holder', () => {
    expect(toolbarVisibilityModule.id).toBe(TOOLBAR_VISIBILITY_MODULE_ID);
    expect(toolbarVisibilityModule.getInitialState()).toEqual(INITIAL_TOOLBAR_VISIBILITY);
  });

  it('deserialize drops non-boolean visibility entries', () => {
    const state = toolbarVisibilityModule.deserialize!({
      visible: { filters: true, style: 'yes', alerts: false, broken: null },
    });
    expect(state.visible).toEqual({ filters: true, alerts: false });
  });

  it('deserialize returns empty map for malformed input', () => {
    expect(toolbarVisibilityModule.deserialize!(null)).toEqual({ visible: {} });
    expect(toolbarVisibilityModule.deserialize!({ visible: [] })).toEqual({ visible: {} });
  });

  it('serialize round-trips visible map', () => {
    const state = { visible: { filters: true, style: false } };
    expect(toolbarVisibilityModule.serialize!(state)).toBe(state);
  });
});
