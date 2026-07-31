/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useViewTabTitle } from '../useViewTabTitle.js';

function Harness({ fallback }: { fallback: string }) {
  const { title, setTitle } = useViewTabTitle(fallback);
  return (
    <button type="button" data-testid="title" onClick={() => setTitle('Edited Caption')}>
      {title}
    </button>
  );
}

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  vi.useRealTimers();
});

describe('useViewTabTitle — outside OpenFin', () => {
  it('returns the fallback and setTitle only updates local state', () => {
    const { getByTestId } = render(<Harness fallback="Markets" />);
    const btn = getByTestId('title');
    expect(btn.textContent).toBe('Markets');
    act(() => btn.click());
    expect(btn.textContent).toBe('Edited Caption');
  });
});

describe('useViewTabTitle — under OpenFin', () => {
  let getOptions: ReturnType<typeof vi.fn>;
  let updateOptions: ReturnType<typeof vi.fn>;
  let customData: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    customData = {};
    getOptions = vi.fn(async () => ({ customData }));
    updateOptions = vi.fn(async (opts: any) => {
      customData = { ...customData, ...opts.customData };
    });
    (globalThis as any).fin = { me: { getOptions, updateOptions } };
  });

  it('seeds the caption from customData.savedTitle', async () => {
    customData = { savedTitle: 'Saved Tab Name' };
    const { getByTestId } = render(<Harness fallback="Markets" />);
    // Initial render shows the fallback before the async seed resolves.
    expect(getByTestId('title').textContent).toBe('Markets');
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByTestId('title').textContent).toBe('Saved Tab Name');
  });

  it('reflects an external "Save Tab As…" rename within the poll interval', async () => {
    const { getByTestId } = render(<Harness fallback="Markets" />);
    await act(async () => {
      await Promise.resolve();
    });
    // External rename writes savedTitle into this view's customData.
    customData = { savedTitle: 'Renamed Externally' };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getByTestId('title').textContent).toBe('Renamed Externally');
  });

  it('prefers the options-changed event over polling when the runtime supports it', async () => {
    let optionsHandler: ((evt: { options?: { customData?: unknown } }) => void) | null = null;
    const on = vi.fn((event: string, cb: (evt: { options?: { customData?: unknown } }) => void) => {
      if (event === 'options-changed') optionsHandler = cb;
    });
    const removeListener = vi.fn();
    (globalThis as any).fin = { me: { getOptions, updateOptions, on, removeListener } };

    const { getByTestId, unmount } = render(<Harness fallback="Markets" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(on).toHaveBeenCalledWith('options-changed', expect.any(Function));

    // External rename delivered via the event — no timer advance needed.
    act(() => {
      optionsHandler!({ options: { customData: { savedTitle: 'Renamed Via Event' } } });
    });
    expect(getByTestId('title').textContent).toBe('Renamed Via Event');

    // No poll was armed: advancing time issues no further getOptions.
    getOptions.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(getOptions).not.toHaveBeenCalled();

    unmount();
    expect(removeListener).toHaveBeenCalledWith('options-changed', expect.any(Function));
  });

  it('setTitle writes document.title and persists savedTitle to customData', async () => {
    const { getByTestId } = render(<Harness fallback="Markets" />);
    await act(async () => {
      getByTestId('title').click();
      await Promise.resolve();
    });
    expect(document.title).toBe('Edited Caption');
    expect(updateOptions).toHaveBeenCalledWith({
      customData: { savedTitle: 'Edited Caption' },
    });
  });
});
