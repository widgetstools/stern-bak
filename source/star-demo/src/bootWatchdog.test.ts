import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBootWatchdog } from './bootWatchdog';

describe('installBootWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
    performance.clearMarks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears reload guard when boot mark landed', () => {
    sessionStorage.setItem('starui-boot-watchdog-reloads', '1');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { name: 'starui:config-ready' } as PerformanceEntry,
    ]);

    installBootWatchdog();
    vi.advanceTimersByTime(30_000);

    expect(sessionStorage.getItem('starui-boot-watchdog-reloads')).toBeNull();
  });

  it('reloads once when no boot mark appears', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    installBootWatchdog();
    vi.advanceTimersByTime(30_000);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('starui-boot-watchdog-reloads')).toBe('1');
  });

  it('shows stall screen after second stall', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    sessionStorage.setItem('starui-boot-watchdog-reloads', '1');
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    installBootWatchdog();
    vi.advanceTimersByTime(30_000);

    expect(reload).not.toHaveBeenCalled();
    expect(document.getElementById('root')?.textContent).toContain('Platform boot stalled twice');
  });

  it('no-ops when window is undefined', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error test shim
    delete globalThis.window;
    expect(() => installBootWatchdog()).not.toThrow();
    globalThis.window = originalWindow;
  });
});
