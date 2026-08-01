import { act, cleanup, renderHook } from '@testing-library/react';
import { themeQuartz } from 'ag-grid-community';
import {
  agGridBlotterDarkParams,
  agGridBlotterLightParams,
} from '@wellsfargo-starui/design-system';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgGridTheme } from '../useAgGridTheme.js';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

describe('useAgGridTheme — params source', () => {
  it('passes the design-system blotter dark params to themeQuartz.withParams when resolved dark', () => {
    const spy = vi.spyOn(themeQuartz, 'withParams');
    document.documentElement.setAttribute('data-theme', 'dark');
    renderHook(() => useAgGridTheme('auto'));
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(lastCall?.[0]).toEqual(agGridBlotterDarkParams);
  });

  it('passes the design-system blotter light params when resolved light', () => {
    const spy = vi.spyOn(themeQuartz, 'withParams');
    document.documentElement.setAttribute('data-theme', 'light');
    renderHook(() => useAgGridTheme('auto'));
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(lastCall?.[0]).toEqual(agGridBlotterLightParams);
  });
});

describe('useAgGridTheme — context reactivity', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  it('switches theme when [data-theme] flips on <html>', async () => {
    const { result } = renderHook(() => useAgGridTheme('auto'));
    const darkTheme = result.current;

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      // Allow MutationObserver microtask to dispatch.
      await Promise.resolve();
    });

    expect(result.current).not.toBe(darkTheme);
  });

  it('explicit "light" mode ignores the document attribute', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const spy = vi.spyOn(themeQuartz, 'withParams');
    renderHook(() => useAgGridTheme('light'));
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(lastCall?.[0]).toEqual(agGridBlotterLightParams);
  });
});
