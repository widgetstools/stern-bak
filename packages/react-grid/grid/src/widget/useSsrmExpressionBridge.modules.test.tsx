/**
 * The expression bridge mounts unconditionally from {@link MarketsGrid} —
 * CSRM grids included — but it reads three customizer module slices that only
 * exist when those modules are registered. `MINIMAL_MODULES` registers none of
 * them, and `createGridStore` seeds `moduleStates` purely from the module list,
 * so `useModuleState` hands back `undefined` for all three. Dereferencing that
 * threw during render and took the whole grid down.
 *
 * Uses a real GridPlatform (no `useModuleState` mock) precisely because the
 * mocked variants in the sibling specs are what let the crash through.
 *
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../customizer/hooks/GridProvider.js';
import { DEFAULT_MODULES, MINIMAL_MODULES } from './modules.js';
import { useSsrmExpressionBridge } from './useSsrmExpressionBridge.js';

function renderWithModules(modules: typeof MINIMAL_MODULES) {
  const platform = new GridPlatform({ gridId: 'bridge-modules', modules });
  return renderHook(() => useSsrmExpressionBridge(undefined, false), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <GridProvider platform={platform}>{children}</GridProvider>
    ),
  });
}

describe('useSsrmExpressionBridge — module presets', () => {
  it('mounts under MINIMAL_MODULES, which registers none of the expression modules', () => {
    expect(() => renderWithModules(MINIMAL_MODULES)).not.toThrow();
  });

  it('still mounts under DEFAULT_MODULES', () => {
    expect(() => renderWithModules(DEFAULT_MODULES)).not.toThrow();
  });
});
