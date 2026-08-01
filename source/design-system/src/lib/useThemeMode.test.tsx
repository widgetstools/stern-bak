import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeModeProvider, useThemeMode } from './useThemeMode';
import { mockApplyTheme, mockGetTheme } from '../testSetupMocks';

describe('useThemeMode', () => {
  beforeEach(() => {
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
  });

  it('initializes from getTheme and toggles', () => {
    const { result } = renderHook(() => useThemeMode(), {
      wrapper: ThemeModeProvider,
    });
    expect(result.current.mode).toBe('dark');
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('light');
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light' });
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('dark');
  });
});
