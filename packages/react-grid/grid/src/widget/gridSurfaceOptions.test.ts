import { describe, expect, it } from 'vitest';
import {
  resolveSurfaceHostOverrideKeys,
  shouldSkipGridOptionSync,
  stripSurfaceManagedGridOptions,
} from './gridSurfaceOptions';

describe('gridSurfaceOptions', () => {
  it('resolves only explicitly provided host override keys', () => {
    const keys = resolveSurfaceHostOverrideKeys({
      sideBar: { toolPanels: ['columns'] },
      statusBar: { statusPanels: [] },
    });
    expect([...keys].sort()).toEqual(['sideBar', 'statusBar']);
  });

  it('leaves pipeline keys in the spread when the host did not override', () => {
    const stripped = stripSurfaceManagedGridOptions(
      { animateRows: false, sideBar: false, cellSelection: true, quickFilterText: 'x' },
      new Set(),
    );
    expect(stripped.animateRows).toBe(false);
    expect(stripped.sideBar).toBe(false);
    expect(stripped.cellSelection).toBeUndefined();
    expect(stripped.quickFilterText).toBe('x');
  });

  it('strips host-overridden keys from the pipeline spread', () => {
    const hostKeys = resolveSurfaceHostOverrideKeys({ sideBar: { toolPanels: ['filters'] } });
    const stripped = stripSurfaceManagedGridOptions(
      { animateRows: true, sideBar: false, quickFilterText: 'x' },
      hostKeys,
    );
    expect(stripped.sideBar).toBeUndefined();
    expect(stripped.animateRows).toBe(true);
  });

  it('skips setGridOption sync for host overrides and fixed surface keys', () => {
    const hostKeys = resolveSurfaceHostOverrideKeys({ statusBar: { statusPanels: [] } });
    expect(shouldSkipGridOptionSync('statusBar', hostKeys)).toBe(true);
    expect(shouldSkipGridOptionSync('animateRows', hostKeys)).toBe(false);
    expect(shouldSkipGridOptionSync('cellSelection', hostKeys)).toBe(true);
  });
});
