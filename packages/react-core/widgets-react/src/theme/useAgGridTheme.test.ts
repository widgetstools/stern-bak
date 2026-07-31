import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

const useGridTheme = vi.fn(() => 'mock-grid-theme');

vi.mock('@wellsfargo-starui/grid', () => ({
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
