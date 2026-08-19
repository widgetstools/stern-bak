/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import { useThrottledArrowKeyRepeat } from './useThrottledArrowKeyRepeat';

function Harness({ holdThresholdMs, throttleIntervalMs }: { holdThresholdMs?: number; throttleIntervalMs?: number }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useThrottledArrowKeyRepeat(rootRef, holdThresholdMs, throttleIntervalMs);
  return (
    <div ref={rootRef} data-testid="surface">
      <input data-testid="editor" />
    </div>
  );
}

/** Dispatches a keydown that reaches the surface's capture listener and,
 *  unless suppressed, bubbles to a spy attached below it — mirroring
 *  where AG Grid's own row-container listener sits in the real DOM. */
function fireKeydown(
  target: HTMLElement,
  key: string,
  opts: { repeat?: boolean } = {},
): { defaultPrevented: boolean } {
  const event = new KeyboardEvent('keydown', {
    key,
    repeat: opts.repeat ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return { defaultPrevented: event.defaultPrevented };
}

describe('useThrottledArrowKeyRepeat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('lets the initial (non-repeat) keydown through untouched', () => {
    const { getByTestId } = render(<Harness />);
    const surface = getByTestId('surface');
    const heardBySurface = vi.fn();
    surface.addEventListener('keydown', heardBySurface);

    const result = fireKeydown(surface, 'ArrowDown', { repeat: false });

    expect(heardBySurface).toHaveBeenCalledTimes(1);
    expect(result.defaultPrevented).toBe(false);
  });

  it('lets repeats through unthrottled until the hold threshold is crossed', () => {
    const { getByTestId } = render(<Harness holdThresholdMs={200} throttleIntervalMs={80} />);
    const surface = getByTestId('surface');
    const heardBySurface = vi.fn();
    surface.addEventListener('keydown', heardBySurface);

    fireKeydown(surface, 'ArrowDown', { repeat: false }); // t=0, starts the hold
    vi.setSystemTime(Date.now() + 50);
    fireKeydown(surface, 'ArrowDown', { repeat: true }); // t=50, within 200ms threshold
    vi.setSystemTime(Date.now() + 50);
    fireKeydown(surface, 'ArrowDown', { repeat: true }); // t=100, still within threshold

    expect(heardBySurface).toHaveBeenCalledTimes(3);
  });

  it('drops excess repeats once past the hold threshold, keeping only one per throttle interval', () => {
    const { getByTestId } = render(<Harness holdThresholdMs={200} throttleIntervalMs={80} />);
    const surface = getByTestId('surface');
    const heardBySurface = vi.fn();
    surface.addEventListener('keydown', heardBySurface);

    fireKeydown(surface, 'ArrowDown', { repeat: false }); // t=0
    // Native repeat firing every 30ms — far faster than the 80ms throttle.
    let prevented = 0;
    for (let t = 30; t <= 300; t += 30) {
      vi.setSystemTime(Date.now() + 30);
      const { defaultPrevented } = fireKeydown(surface, 'ArrowDown', { repeat: true });
      if (defaultPrevented) prevented++;
    }

    // Past 200ms, throttling engages; some of the 30ms-spaced repeats
    // (faster than the 80ms floor) must be dropped.
    expect(prevented).toBeGreaterThan(0);
    expect(heardBySurface.mock.calls.length).toBeLessThan(11); // fewer than the 10 repeats + initial
  });

  it('resets on keyup — a fresh hold is unthrottled again from zero', () => {
    const { getByTestId } = render(<Harness holdThresholdMs={200} throttleIntervalMs={80} />);
    const surface = getByTestId('surface');

    fireKeydown(surface, 'ArrowDown', { repeat: false });
    for (let t = 0; t < 400; t += 30) {
      vi.setSystemTime(Date.now() + 30);
      fireKeydown(surface, 'ArrowDown', { repeat: true });
    }
    surface.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }));

    const heardBySurface = vi.fn();
    surface.addEventListener('keydown', heardBySurface);
    const fresh = fireKeydown(surface, 'ArrowDown', { repeat: false });
    vi.setSystemTime(Date.now() + 50);
    const secondWithinGrace = fireKeydown(surface, 'ArrowDown', { repeat: true });

    expect(fresh.defaultPrevented).toBe(false);
    expect(secondWithinGrace.defaultPrevented).toBe(false);
    expect(heardBySurface).toHaveBeenCalledTimes(2);
  });

  it('ignores non-arrow keys entirely', () => {
    const { getByTestId } = render(<Harness />);
    const surface = getByTestId('surface');
    const heardBySurface = vi.fn();
    surface.addEventListener('keydown', heardBySurface);

    fireKeydown(surface, 'a', { repeat: false });
    for (let t = 0; t < 400; t += 20) {
      vi.setSystemTime(Date.now() + 20);
      fireKeydown(surface, 'a', { repeat: true });
    }

    // Never suppressed regardless of hold duration — not a throttled key.
    expect(heardBySurface.mock.calls.length).toBe(21);
  });

  it('never suppresses arrow keys while the event target is a text editor', () => {
    const { getByTestId } = render(<Harness holdThresholdMs={200} throttleIntervalMs={80} />);
    const editor = getByTestId('editor');
    const heardBySurface = vi.fn();
    getByTestId('surface').addEventListener('keydown', heardBySurface);

    fireKeydown(editor, 'ArrowDown', { repeat: false });
    for (let t = 0; t < 400; t += 30) {
      vi.setSystemTime(Date.now() + 30);
      fireKeydown(editor, 'ArrowDown', { repeat: true });
    }

    expect(heardBySurface.mock.calls.length).toBe(15);
  });
});
