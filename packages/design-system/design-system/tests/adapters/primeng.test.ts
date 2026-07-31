import { describe, it, expect } from 'vitest';
import { primengPreset } from '../../src/adapters/primeng';

describe('primengPreset', () => {
  it('has an azure primitive ramp', () => {
    expect(primengPreset.primitive?.azure).toBeDefined();
  });

  it('has a semantic block with primary scale 50..900', () => {
    const primary = primengPreset.semantic?.primary as Record<string, string> | undefined;
    expect(primary).toBeDefined();
    for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(primary![String(k)]).toBeDefined();
    }
  });

  it('has light and dark colorSchemes', () => {
    const cs = primengPreset.semantic?.colorScheme;
    expect(cs?.light).toBeDefined();
    expect(cs?.dark).toBeDefined();
  });

  it('uses OKLCH StarUI palette literals', () => {
    const json = JSON.stringify(primengPreset);
    expect(json).toMatch(/oklch\(/);
    expect(json).toMatch(/azure\.500/);
  });

  it('matches snapshot', () => {
    expect(primengPreset).toMatchSnapshot();
  });
});
