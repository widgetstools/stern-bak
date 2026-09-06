import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

const useGridTheme = vi.fn(() => 'mock-grid-theme');

// Partial: keep every real export and override only what this test stubs.
// A full replacement broke whenever the container started importing
// something else from the package (e.g. `createLiveRowSource`), which is a
// failure that points at the mock rather than at the change.
vi.mock('@wellsfargo-starui/grid', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGridTheme: () => useGridTheme(),
}));

const { useAgGridTheme } = await import('./useAgGridTheme.js');

describe('theme/useAgGridTheme', () => {
  afterEach(() => {
    cleanup();
    useGridTheme.mockReset().mockReturnValue('mock-grid-theme');
  });

  it('returns the theme from useGridTheme', () => {
    const { result } = renderHook(() => useAgGridTheme());
    expect(result.current.theme).toBe('mock-grid-theme');
    expect(useGridTheme).toHaveBeenCalled();
  });
});
