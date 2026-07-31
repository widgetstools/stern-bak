import { describe, expect, it } from 'vitest';
import { controls, type ControlSize } from '../../src/tokens/controls';

/**
 * The four control tiers are the density scale every control in the system
 * sizes against. The invariant worth pinning is that they stay ordered by
 * physical height — the comments call them "sorted ascending", and a tier that
 * drifts out of order makes `sm` taller than `md` and silently breaks visual
 * rhythm across toolbars.
 */

const SIZES: ControlSize[] = ['xs', 'sm', 'md', 'lg'];
const px = (v: string) => Number.parseFloat(v);

describe('controls', () => {
  it('defines exactly the four documented tiers', () => {
    expect(Object.keys(controls).sort()).toEqual([...SIZES].sort());
  });

  it('gives every tier a complete ControlTier shape', () => {
    for (const size of SIZES) {
      const tier = controls[size];
      for (const key of ['height', 'paddingX', 'gap', 'fontSize', 'iconSize', 'borderRadius']) {
        expect(tier[key as keyof typeof tier], `${size}.${key}`).toBeTruthy();
      }
    }
  });

  it('orders tiers ascending by height', () => {
    const heights = SIZES.map((s) => px(controls[s].height));
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new Set(heights).size).toBe(heights.length);
  });

  it('pins the documented pixel heights', () => {
    // These are referenced by comment in the source and by the ui package's
    // button variants; a silent change desynchronises them.
    expect(controls.xs.height).toBe('24px');
    expect(controls.sm.height).toBe('26px');
    expect(controls.md.height).toBe('28px');
    expect(controls.lg.height).toBe('30px');
  });

  it('never lets icon size exceed the tier height', () => {
    for (const size of SIZES) {
      expect(px(controls[size].iconSize), size).toBeLessThan(px(controls[size].height));
    }
  });

  it('scales icon size monotonically with the tier', () => {
    const icons = SIZES.map((s) => px(controls[s].iconSize));
    expect(icons).toEqual([...icons].sort((a, b) => a - b));
  });

  it('expresses every dimension in px', () => {
    for (const size of SIZES) {
      for (const key of ['height', 'paddingX', 'gap', 'iconSize'] as const) {
        expect(controls[size][key], `${size}.${key}`).toMatch(/px$/);
      }
    }
  });
});
