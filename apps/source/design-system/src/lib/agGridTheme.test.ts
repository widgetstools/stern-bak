import { describe, expect, it } from 'vitest';
import { blotterTheme, gridTheme } from './agGridTheme';

describe('agGridTheme', () => {
  it('re-exports starui grid themes', () => {
    expect(gridTheme).toEqual({ name: 'staruiGridTheme' });
    expect(blotterTheme).toEqual({ name: 'agGridBlotterDarkTheme' });
  });
});
