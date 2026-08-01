import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openOpenFinPopout } from './popout';

// Mock fin global
const closedHandlers: Array<() => void> = [];

const mockWindow = {
  on: vi.fn((event: string, handler: () => void) => {
    if (event === 'closed') {
      closedHandlers.push(handler);
    }
  }),
  removeListener: vi.fn((event: string, handler: () => void) => {
    if (event === 'closed') {
      const idx = closedHandlers.indexOf(handler);
      if (idx >= 0) closedHandlers.splice(idx, 1);
    }
  }),
  close: vi.fn(),
  setAsForeground: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn().mockResolvedValue({ url: 'http://example.com/old' }),
  navigate: vi.fn().mockResolvedValue(undefined),
};

const mockPlatform = {
  createWindow: vi.fn().mockResolvedValue(mockWindow),
  getCurrentSync: vi.fn(),
};

const mockFin = {
  me: {
    identity: { uuid: 'test-uuid' },
  },
  Window: {
    wrapSync: vi.fn(() => mockWindow),
  },
  Platform: {
    getCurrentSync: vi.fn(() => mockPlatform),
  },
};

describe('popout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closedHandlers.length = 0;
    (global as any).fin = mockFin;
  });

  afterEach(() => {
    delete (global as any).fin;
  });

  it('throws when fin is not available', async () => {
    delete (global as any).fin;
    await expect(
      openOpenFinPopout('popout', {
        name: 'test-window',
        url: 'http://example.com/page',
        width: 800,
        height: 600,
      })
    ).rejects.toThrow('[runtime-openfin/popout] fin is not available');
  });

  it('wraps existing window and focuses it', async () => {
    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/same',
      width: 800,
      height: 600,
    });

    expect(mockFin.Window.wrapSync).toHaveBeenCalledWith({
      uuid: 'test-uuid',
      name: 'test-window',
    });
    expect(mockWindow.setAsForeground).toHaveBeenCalled();
    expect(handle.kind).toBe('popout');
    expect(handle.id).toBe('test-window');
  });

  it('navigates existing window to new URL if different', async () => {
    mockWindow.getInfo.mockResolvedValueOnce({ url: 'http://example.com/old' });

    await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/new',
      width: 800,
      height: 600,
    });

    expect(mockWindow.navigate).toHaveBeenCalledWith('http://example.com/new');
  });

  it('does not navigate if URL is same document', async () => {
    mockWindow.getInfo.mockResolvedValueOnce({ url: 'http://example.com/page?x=1' });

    await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page?x=1',
      width: 800,
      height: 600,
    });

    expect(mockWindow.navigate).not.toHaveBeenCalled();
  });

  it('creates new window when wrap fails', async () => {
    mockFin.Window.wrapSync.mockImplementationOnce(() => {
      throw new Error('Window not found');
    });

    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 1024,
      height: 768,
    });

    expect(mockPlatform.createWindow).toHaveBeenCalledWith({
      name: 'test-window',
      url: 'http://example.com/page',
      defaultWidth: 1024,
      defaultHeight: 768,
      autoShow: true,
      frame: true,
      resizable: true,
      saveWindowState: true,
      contextMenu: true,
    });
    expect(handle.kind).toBe('popout');
  });

  it('passes customData to createWindow', async () => {
    mockFin.Window.wrapSync.mockImplementationOnce(() => {
      throw new Error('Window not found');
    });

    const customData = { key: 'value', count: 42 };
    await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
      customData,
    });

    expect(mockPlatform.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        customData,
      })
    );
  });

  it('surface handle close removes listener and fires callbacks', async () => {
    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    const closedFn = vi.fn();
    handle.onClosed(closedFn);
    handle.close();

    expect(mockWindow.close).toHaveBeenCalled();
    expect(mockWindow.removeListener).toHaveBeenCalledWith('closed', expect.any(Function));
    expect(closedFn).toHaveBeenCalled();
  });

  it('surface handle focus calls setAsForeground', async () => {
    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    mockWindow.setAsForeground.mockClear();
    handle.focus();

    expect(mockWindow.setAsForeground).toHaveBeenCalled();
  });

  it('onClosed returns unsubscribe function', async () => {
    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    const closedFn = vi.fn();
    const unsubscribe = handle.onClosed(closedFn);

    handle.close();
    expect(closedFn).toHaveBeenCalled();

    closedFn.mockClear();
    unsubscribe();
    handle.close();

    // Should not call after unsubscribe
    expect(closedFn).not.toHaveBeenCalled();
  });

  it('handles errors in fin.on gracefully', async () => {
    mockWindow.on.mockImplementationOnce(() => {
      throw new Error('on not supported');
    });

    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    const closedFn = vi.fn();
    handle.onClosed(closedFn);
    handle.close();

    // Should not crash even though on() threw
    expect(handle.kind).toBe('popout');
  });

  it('handles errors in close gracefully', async () => {
    mockWindow.close.mockImplementationOnce(() => {
      throw new Error('close failed');
    });

    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    // Should not throw
    expect(() => handle.close()).not.toThrow();
  });

  it('handles errors in focus gracefully', async () => {
    mockWindow.setAsForeground.mockImplementationOnce(() => {
      throw new Error('focus failed');
    });

    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    // Should not throw
    expect(() => handle.focus()).not.toThrow();
  });

  it('does not fire closed event twice', async () => {
    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    const closedFn = vi.fn();
    handle.onClosed(closedFn);

    // Manually trigger the closed event multiple times
    closedHandlers[0]?.();
    closedHandlers[0]?.();

    // Should only fire once
    expect(closedFn).toHaveBeenCalledTimes(1);
  });

  it('clears listeners after first closed event', async () => {
    const handle = await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    const closedFn1 = vi.fn();
    const closedFn2 = vi.fn();
    handle.onClosed(closedFn1);
    handle.onClosed(closedFn2);

    handle.close();

    expect(closedFn1).toHaveBeenCalledTimes(1);
    expect(closedFn2).toHaveBeenCalledTimes(1);
  });

  it('handles malformed URL comparison gracefully', async () => {
    mockWindow.getInfo.mockResolvedValueOnce({ url: 'not a url' });

    await expect(
      openOpenFinPopout('popout', {
        name: 'test-window',
        url: 'also not a url',
        width: 800,
        height: 600,
      })
    ).resolves.toBeDefined();

    // Should navigate because URL parsing failed
    expect(mockWindow.navigate).toHaveBeenCalled();
  });

  it('handles missing URL info in getInfo', async () => {
    mockWindow.getInfo.mockResolvedValueOnce({});

    await openOpenFinPopout('popout', {
      name: 'test-window',
      url: 'http://example.com/page',
      width: 800,
      height: 600,
    });

    // Should navigate because currentUrl is empty
    expect(mockWindow.navigate).toHaveBeenCalled();
  });
});
