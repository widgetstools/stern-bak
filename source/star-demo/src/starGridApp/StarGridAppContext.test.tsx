import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  StarGridAppProvider,
  useStarGridApp,
  useStarGridHost,
} from './StarGridAppContext';
import type { StarGridAppState } from './types';

function makeState(): StarGridAppState {
  const host = { gridId: 'test-grid' };
  return {
    runtime: {
      getTheme: () => 'dark',
      setTheme: () => {},
      onThemeChanged: () => () => {},
      // Intentional partial mock: these tests only exercise the theme slice.
    } as unknown as StarGridAppState['runtime'],
    theme: 'dark',
    setTheme: () => {},
    onThemeChanged: () => () => {},
    hostForGrid: () => host as StarGridAppState['hostForGrid'] extends (s: unknown) => infer R ? R : never,
  };
}

describe('StarGridAppContext', () => {
  it('throws outside provider', () => {
    expect(() => renderHook(() => useStarGridApp())).toThrow(
      'useStarGridApp must be used within <StarGridApp>',
    );
  });

  it('returns app state inside provider', () => {
    const state = makeState();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(StarGridAppProvider, { value: state, children });

    const { result } = renderHook(() => useStarGridApp(), { wrapper });
    expect(result.current).toBe(state);
  });

  it('useStarGridHost delegates to hostForGrid', () => {
    const state = makeState();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(StarGridAppProvider, { value: state, children });

    const { result } = renderHook(
      () => useStarGridHost({ gridId: 'grid-a' }),
      { wrapper },
    );
    expect(result.current).toEqual({ gridId: 'test-grid' });
  });
});
