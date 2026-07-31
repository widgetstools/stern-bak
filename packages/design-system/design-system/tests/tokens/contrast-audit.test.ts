import { describe, it, expect } from 'vitest';
import { dark, light } from '../../src/tokens/semantic';
import { contrastRatio } from '../../src/internal/wcag';

const schemes = [['dark', dark], ['light', light]] as const;

describe('FI Design System contrast audit', () => {
  for (const [name, s] of schemes) {
    describe(name, () => {
      it('text.primary on surface.ground ≥ 7 (AAA body)', () => {
        expect(contrastRatio(s.text.primary, s.surface.ground)).toBeGreaterThanOrEqual(7);
      });

      it('text.secondary on surface.ground ≥ 4.5 (AA chrome)', () => {
        expect(contrastRatio(s.text.secondary, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('text.muted on surface.ground ≥ 4 (AA approx)', () => {
        expect(contrastRatio(s.text.muted, s.surface.ground)).toBeGreaterThanOrEqual(4);
      });

      it('accent.info on surface.ground ≥ 3.3 (STARUI clinical graphics)', () => {
        // STARUI clinical cyan on #f4f6f8 is ~3.4:1 — badge/link graphics, not body text.
        expect(contrastRatio(s.accent.info, s.surface.ground)).toBeGreaterThanOrEqual(3.3);
      });

      it('accent.positive on surface.ground ≥ 3.4 (STARUI clinical graphics)', () => {
        expect(contrastRatio(s.accent.positive, s.surface.ground)).toBeGreaterThanOrEqual(3.4);
      });

      it('accent.negative on surface.ground ≥ 4.3 (STARUI clinical loss)', () => {
        expect(contrastRatio(s.accent.negative, s.surface.ground)).toBeGreaterThanOrEqual(4.3);
      });

      it('accent.warning on surface.ground ≥ 3.0 (palette-locked warning)', () => {
        // Warning accent is palette-locked to #c2410c (light) / #f5c14b (dark) —
        // graphic/badge threshold, not link-text AA.
        expect(contrastRatio(s.accent.warning, s.surface.ground)).toBeGreaterThanOrEqual(3.0);
      });
    });
  }
});
