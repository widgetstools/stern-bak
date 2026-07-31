import { describe, expect, it } from 'vitest';
import { INITIAL_COLUMN_TEMPLATES } from './state.js';

describe('column-templates state', () => {
  it('exports a deep-frozen empty initial state', () => {
    expect(INITIAL_COLUMN_TEMPLATES.templates).toEqual({});
    expect(INITIAL_COLUMN_TEMPLATES.typeDefaults).toEqual({});
    expect(Object.isFrozen(INITIAL_COLUMN_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(INITIAL_COLUMN_TEMPLATES.templates)).toBe(true);
  });
});
