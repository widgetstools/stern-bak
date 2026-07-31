import { describe, expect, it } from 'vitest';
import { INITIAL_COLUMN_CUSTOMIZATION } from './state.js';

describe('column-customization state', () => {
  it('starts with empty assignments', () => {
    expect(INITIAL_COLUMN_CUSTOMIZATION).toEqual({ assignments: {} });
  });
});
