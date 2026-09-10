import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSsrmClipboard } from './sendSsrmClipboard.js';

describe('sendSsrmClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('copies the text and says it is loaded rows only', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    sendSsrmClipboard({ data: 'a\tb' });
    expect(writeText).toHaveBeenCalledWith('a\tb');
    expect(info).toHaveBeenCalledWith(expect.stringContaining('loaded cache'));
  });
});
