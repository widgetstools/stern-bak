import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSsrmClipboard } from './sendSsrmClipboard.js';

describe('sendSsrmClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('copies the text and says it is loaded rows only', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    sendSsrmClipboard({ data: 'a\tb' });
    expect(writeText).toHaveBeenCalledWith('a\tb');
    expect(info).toHaveBeenCalledWith(expect.stringContaining('loaded cache'));
  });

  it('copies an empty string when AG Grid passes no data', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    sendSsrmClipboard({});
    expect(writeText).toHaveBeenCalledWith('');
  });

  /**
   * The async-clipboard API is unavailable on an insecure origin and in some
   * embedded hosts — an OpenFin view served over plain http is the case that
   * matters here. The fallback has to actually put the text somewhere, so the
   * assertions are on the textarea's value and on `execCommand('copy')` being
   * reached, not merely on "did not throw".
   */
  describe('without the async clipboard API', () => {
    it('falls back to a detached textarea and execCommand', () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.stubGlobal('navigator', {});
      const execCommand = vi.fn().mockReturnValue(true);
      let copied: string | undefined;
      // The element is removed before the call returns, so the value is
      // captured at the moment of the copy rather than read afterwards.
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: (cmd: string) => {
          copied = document.querySelector('textarea')?.value;
          return execCommand(cmd);
        },
      });

      sendSsrmClipboard({ data: 'x\ty' });

      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(copied).toBe('x\ty');
      // The scratch textarea must not survive — it would take grid focus.
      expect(document.querySelector('textarea')).toBeNull();
    });

    it('swallows a host that refuses execCommand rather than breaking the copy handler', () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.stubGlobal('navigator', { clipboard: {} });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: () => { throw new Error('blocked by host'); },
      });

      expect(() => sendSsrmClipboard({ data: 'z' })).not.toThrow();
    });
  });
});
