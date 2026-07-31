import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAgGridSetFilterValidateGuard } from './agGridSetFilterValidateGuard';

describe('installAgGridSetFilterValidateGuard', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__agSetFilterValidateGuard;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op outside a browser environment', () => {
    const win = window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
    expect(() => installAgGridSetFilterValidateGuard()).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = win;
  });

  it('registers listeners once and swallows the known AG-Grid bug', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installAgGridSetFilterValidateGuard();
    installAgGridSetFilterValidateGuard();

    const err = new Error('model.values is not iterable');
    err.stack = 'SetFilterHandler.validateModel at ag-grid-enterprise';

    const event = new ErrorEvent('error', { error: err, message: err.message });
    const prevent = vi.spyOn(event, 'preventDefault');
    const stop = vi.spyOn(event, 'stopImmediatePropagation');
    window.dispatchEvent(event);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SetFilterHandler.validateModel bug'));
    expect(prevent).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('swallows matching unhandled rejections', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installAgGridSetFilterValidateGuard();

    const reason = new Error('model.values is not iterable');
    reason.stack = 'validateModel in ag-grid-enterprise';
    const promise = Promise.reject(reason);
    promise.catch(() => {});
    const event = new PromiseRejectionEvent('unhandledrejection', {
      promise,
      reason,
    });
    const prevent = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unhandled rejection'));
    expect(prevent).toHaveBeenCalled();
  });

  it('ignores unrelated errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installAgGridSetFilterValidateGuard();

    const err = new Error('something else');
    const event = new ErrorEvent('error', { error: err, message: err.message });
    const prevent = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(warn).not.toHaveBeenCalled();
    expect(prevent).not.toHaveBeenCalled();
  });
});
