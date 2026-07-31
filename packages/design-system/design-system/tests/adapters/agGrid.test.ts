import { describe, it, expect } from 'vitest';
import {
  agGridDarkParams, agGridLightParams,
  agGridComfortDarkParams, agGridComfortLightParams,
  agGridBlotterDarkParams, agGridBlotterLightParams,
  gridDensityStructuralParams,
  inferGridDensity,
  resolveGridDensity,
} from '../../src/adapters/agGrid';

describe('agGrid params', () => {
  it.each([['agGridDarkParams', agGridDarkParams]] as const)
    ('%s defines backgroundColor', (_n, p) => {
      // legacy AG Grid v33 used backgroundColor; v35 uses backgroundColor too
      expect((p as any).backgroundColor).toBeDefined();
    });

  it('dark and light differ in header chrome and browserColorScheme', () => {
    expect((agGridDarkParams as any).headerBackgroundColor)
      .not.toBe((agGridLightParams as any).headerBackgroundColor);
    expect((agGridDarkParams as any).browserColorScheme).toBe('dark');
    expect((agGridLightParams as any).browserColorScheme).toBe('light');
  });

  it('blotter variants exist', () => {
    expect(agGridBlotterDarkParams).toBeDefined();
    expect(agGridBlotterLightParams).toBeDefined();
  });

  it('comfort variants exist', () => {
    expect(agGridComfortDarkParams).toBeDefined();
    expect(agGridComfortLightParams).toBeDefined();
  });

  it('grid density presets map to distinct row/header heights and spacing', () => {
    const ultra = gridDensityStructuralParams('ultra');
    const compact = gridDensityStructuralParams('compact');
    const comfort = gridDensityStructuralParams('comfort');
    expect(ultra.rowHeight).toBe(22);
    expect(compact.rowHeight).toBe(30);
    expect(comfort.rowHeight).toBe(40);
    expect(ultra.spacing).toBeLessThan(compact.spacing);
    expect(compact.spacing).toBeLessThan(comfort.spacing);
    expect(ultra.fontSize).toBeLessThan(compact.fontSize);
    expect(compact.fontSize).toBeLessThan(comfort.fontSize);
    expect(ultra.iconSize).toBeLessThan(compact.iconSize);
  });

  it('inferGridDensity resolves from persisted heights', () => {
    expect(inferGridDensity(22, 26)).toBe('ultra');
    expect(inferGridDensity(30, 32)).toBe('compact');
    expect(resolveGridDensity({ gridDensity: 'comfort' })).toBe('comfort');
  });

  it('matches snapshot', () => {
    expect({
      dark: agGridDarkParams, light: agGridLightParams,
      comfortDark: agGridComfortDarkParams, comfortLight: agGridComfortLightParams,
      blotterDark: agGridBlotterDarkParams, blotterLight: agGridBlotterLightParams,
    }).toMatchSnapshot();
  });
});
