import { describe, expect, it } from 'vitest';
import { GRID_STATE_SCHEMA_VERSION, INITIAL_GRID_STATE } from './state.js';

describe('grid-state state', () => {
  it('exports schema version 3 and null saved snapshot', () => {
    expect(GRID_STATE_SCHEMA_VERSION).toBe(3);
    expect(INITIAL_GRID_STATE).toEqual({ saved: null });
  });
});
