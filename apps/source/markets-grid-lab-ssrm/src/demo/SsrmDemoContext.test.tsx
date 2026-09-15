import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { SsrmDemoProvider, useSsrmDemoRegistry, type SsrmStreamHandle } from './SsrmDemoContext';

afterEach(cleanup);

const handle = (tabId: string): SsrmStreamHandle => ({
  tabId,
  provider: { id: `p-${tabId}` } as never,
  getGridApi: () => null,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SsrmDemoProvider>{children}</SsrmDemoProvider>
);

describe('SsrmDemoProvider', () => {
  it('starts with no tab registered, so the rail renders disabled', () => {
    const { result } = renderHook(() => useSsrmDemoRegistry(), { wrapper });
    expect(result.current.handle).toBeNull();
  });

  it('publishes the active tab\'s handle to the rail', () => {
    const { result } = renderHook(() => useSsrmDemoRegistry(), { wrapper });

    act(() => { result.current.register(handle('overview')); });

    expect(result.current.handle?.tabId).toBe('overview');
  });

  /**
   * Tabs mount one at a time and each withdraws on unmount. The rail must
   * follow the LAST registration, or a scenario click lands on the provider
   * handle of a tab that is no longer on screen.
   */
  it('follows the most recent registration', () => {
    const { result } = renderHook(() => useSsrmDemoRegistry(), { wrapper });

    act(() => { result.current.register(handle('overview')); });
    act(() => { result.current.register(handle('live-updates')); });

    expect(result.current.handle?.tabId).toBe('live-updates');
  });

  it('withdraws the handle when a tab unmounts', () => {
    const { result } = renderHook(() => useSsrmDemoRegistry(), { wrapper });
    act(() => { result.current.register(handle('overview')); });

    act(() => { result.current.register(null); });

    expect(result.current.handle).toBeNull();
  });

  it('keeps the register function stable so a tab\'s effect does not re-fire', () => {
    const { result, rerender } = renderHook(() => useSsrmDemoRegistry(), { wrapper });
    const first = result.current.register;
    rerender();
    // `register` is an effect dependency in every tab; a new identity per
    // render would re-register (and immediately withdraw) on every tick.
    expect(result.current.register).toBe(first);
  });

  it('refuses to be used outside the provider rather than failing silently', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Consumer() {
      useSsrmDemoRegistry();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow('useSsrmDemoRegistry requires SsrmDemoProvider');
    error.mockRestore();
  });

  it('renders its children', () => {
    render(<SsrmDemoProvider><span data-testid="child" /></SsrmDemoProvider>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
