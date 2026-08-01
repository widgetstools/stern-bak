import { describe, expect, it } from 'vitest';
import { INITIAL_CALCULATED_COLUMNS } from './state.js';

describe('calculated-columns state', () => {
  it('starts with no virtual columns', () => {
    expect(INITIAL_CALCULATED_COLUMNS).toEqual({ virtualColumns: [] });
  });
});
