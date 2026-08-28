import { describe, expect, it } from 'vitest';
import { heatmapDomain, heatmapCellColor } from './heatmap';

describe('heatmapDomain', () => {
  it('is undefined for a column with no numeric values', () => {
    expect(heatmapDomain([null, undefined, 'x', ''])).toBeUndefined();
  });

  it('picks sequential for an all-positive column', () => {
    const domain = heatmapDomain([10, 20, 30]);
    expect(domain).toEqual({ kind: 'sequential', maxAbs: 30 });
  });

  it('picks sequential when the minority sign is just rounding noise', () => {
    // One value out of twenty is negative — a blip, not a real split.
    const values = [-0.001, ...Array.from({ length: 19 }, () => 5)];
    expect(heatmapDomain(values)?.kind).toBe('sequential');
  });

  it('picks diverging once the minority side is a real presence', () => {
    const values = [-50, -40, 10, 20, 30, 40, 50, 60, 70, 80];
    expect(heatmapDomain(values)?.kind).toBe('diverging');
  });

  it('ignores non-numeric and blank values when computing the domain', () => {
    expect(heatmapDomain([10, null, 'x', 20, undefined])).toEqual({ kind: 'sequential', maxAbs: 20 });
  });
});

describe('heatmapCellColor', () => {
  const seq = heatmapDomain([10, 20, 100]);
  const div = heatmapDomain([-100, 50]);

  it('is undefined for a blank or non-numeric cell', () => {
    expect(heatmapCellColor(null, seq, 'light')).toBeUndefined();
    expect(heatmapCellColor('x', seq, 'light')).toBeUndefined();
  });

  it('is undefined when the column has no domain at all', () => {
    expect(heatmapCellColor(10, undefined, 'light')).toBeUndefined();
  });

  it('uses the chart-1 token for a sequential column', () => {
    expect(heatmapCellColor(100, seq, 'light')).toContain('var(--chart-1)');
  });

  it('splits a diverging column by sign — negative vs positive tokens', () => {
    expect(heatmapCellColor(-100, div, 'light')).toContain('var(--negative)');
    expect(heatmapCellColor(50, div, 'light')).toContain('var(--positive)');
  });

  it('scales alpha with magnitude — the largest value in the column reads strongest', () => {
    const low = heatmapCellColor(10, seq, 'light')!;
    const high = heatmapCellColor(100, seq, 'light')!;
    const alphaOf = (s: string) => Number(s.match(/\/\s*([\d.]+)\)/)?.[1]);
    expect(alphaOf(high)).toBeGreaterThan(alphaOf(low));
  });

  /** Dark-theme tokens are already lighter before alpha, so the same
   *  numeric alpha would read blown-out — the clamp differs by theme. */
  it('uses a different alpha clamp for dark than for light', () => {
    const lightMax = heatmapCellColor(100, seq, 'light')!;
    const darkMax = heatmapCellColor(100, seq, 'dark')!;
    expect(lightMax).not.toBe(darkMax);
  });

  it('never fully saturates — text on top of the cell stays legible', () => {
    const alphaOf = (s: string) => Number(s.match(/\/\s*([\d.]+)\)/)?.[1]);
    expect(alphaOf(heatmapCellColor(100, seq, 'light')!)).toBeLessThan(1);
    expect(alphaOf(heatmapCellColor(100, seq, 'dark')!)).toBeLessThan(1);
  });
});
