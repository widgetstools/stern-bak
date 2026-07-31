import { describe, it, expect, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { useChordHotkey } from './useChordHotkey.js';
import { PROVIDER_TOOLBAR_TOGGLE_CHORDS } from './providerToolbarHotkeys.js';

function HotkeyProbe() {
  const [count, setCount] = useState(0);
  useChordHotkey(PROVIDER_TOOLBAR_TOGGLE_CHORDS, () => setCount((c) => c + 1));
  return <div data-testid="count">{count}</div>;
}

afterEach(() => cleanup());

describe('useChordHotkey — provider toolbar chords', () => {
  it('fires on Alt+Shift+P (Windows/Linux and macOS Option)', () => {
    const { getByTestId } = render(<HotkeyProbe />);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'P', altKey: true, shiftKey: true, bubbles: true }),
      );
    });
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('fires on Alt+Shift+P when macOS Option remaps event.key to π', () => {
    const { getByTestId } = render(<HotkeyProbe />);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'π',
          code: 'KeyP',
          altKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('fires on capture when a child stops propagation (focused grid)', () => {
    const { getByTestId } = render(
      <div
        data-testid="grid"
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
      >
        <HotkeyProbe />
      </div>,
    );
    act(() => {
      getByTestId('grid').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'P',
          altKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('fires on Meta+Shift+P (macOS Command / Windows Win key)', () => {
    const { getByTestId } = render(<HotkeyProbe />);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'P', metaKey: true, shiftKey: true, bubbles: true }),
      );
    });
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('does not fire on P alone', () => {
    const { getByTestId } = render(<HotkeyProbe />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', bubbles: true }));
    });
    expect(getByTestId('count').textContent).toBe('0');
  });
});
