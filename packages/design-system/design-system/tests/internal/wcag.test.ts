import { describe, it, expect } from 'vitest';
import { contrastRatio, hexToRgb } from '../../src/internal/wcag';

describe('wcag', () => {
  it('hexToRgb parses #rrggbb', () => {
    expect(hexToRgb('#0f1218')).toEqual({ r: 15, g: 18, b: 24 });
  });

  it('hexToRgb parses #rgb shorthand', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('contrastRatio for white-on-black is 21', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });

  it('contrastRatio for identical colors is 1', () => {
    expect(contrastRatio('#abcdef', '#abcdef')).toBeCloseTo(1, 5);
  });

  it('contrastRatio returns ratio >= 1', () => {
    expect(contrastRatio('#ffaaff', '#aaccaa')).toBeGreaterThanOrEqual(1);
  });

  it('Chroma Desk light primary text on ground meets AAA (≥7)', () => {
    // coolInk[0] on chromeLight[100]
    expect(contrastRatio('#0f1218', '#e2e6ee')).toBeGreaterThanOrEqual(7);
  });

  it('Chroma Desk dark primary text on ground meets AAA (≥7)', () => {
    // graphite[50] on graphite[975]
    expect(contrastRatio('#ecf0f5', '#0b0d10')).toBeGreaterThanOrEqual(7);
  });
});
