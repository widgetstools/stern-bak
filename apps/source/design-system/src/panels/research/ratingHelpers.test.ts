import { describe, expect, it } from 'vitest';
import { ratingBadgeStyle } from './ratingHelpers';

describe('ratingBadgeStyle', () => {
  it('returns styles for each rating', () => {
    expect(ratingBadgeStyle('Overweight').color).toContain('positive');
    expect(ratingBadgeStyle('Underweight').color).toContain('negative');
    expect(ratingBadgeStyle('Market Weight').color).toContain('warning');
  });
});
