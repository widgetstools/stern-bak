import { describe, expect, it } from 'vitest';
import { blotterTheme, gridTheme } from './agGridTheme';

describe('agGridTheme', () => {
  it('re-exports the starui grid theme', () => {
    expect(gridTheme).toEqual({ name: 'staruiGridTheme' });
  });

  it('derives the blotter theme from the same token theme at ultra density', () => {
    expect(blotterTheme).toEqual({ name: 'staruiGridTheme', density: 'ultra' });
  });
});
