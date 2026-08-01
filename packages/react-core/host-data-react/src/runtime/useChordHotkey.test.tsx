import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useChordHotkey } from './useChordHotkey.js';

/**
 * The hook listens on the capture phase of a real DOM target, so every test
 * drives it with userEvent rather than dispatching synthetic KeyboardEvents —
 * only the former produces the modifier state and `code` the matcher reads.
 */

afterEach(cleanup);

describe('useChordHotkey', () => {
  it('fires the handler on an exact modifier + key match', async () => {
    const handler = vi.fn();
    renderHook(() => useChordHotkey('Alt+Shift+S', handler));

    await userEvent.keyboard('{Alt>}{Shift>}s{/Shift}{/Alt}');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores the bare key when the modifiers are not held', async () => {
    const handler = vi.fn();
    renderHook(() => useChordHotkey('Alt+Shift+S', handler));

    await userEvent.keyboard('s');
    await userEvent.keyboard('{Shift>}s{/Shift}');

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores a superset of the chord — an extra modifier is a different chord', async () => {
    const handler = vi.fn();
    renderHook(() => useChordHotkey('Alt+Shift+S', handler));

    await userEvent.keyboard('{Control>}{Alt>}{Shift>}s{/Shift}{/Alt}{/Control}');

    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['Control+K', '{Control>}k{/Control}'],
    ['Ctrl+K', '{Control>}k{/Control}'],
    ['Meta+K', '{Meta>}k{/Meta}'],
    ['Cmd+K', '{Meta>}k{/Meta}'],
    ['Command+K', '{Meta>}k{/Meta}'],
    ['Option+K', '{Alt>}k{/Alt}'],
  ])('accepts %s as a spelling of the same chord', async (chord, keys) => {
    const handler = vi.fn();
    renderHook(() => useChordHotkey(chord, handler));

    await userEvent.keyboard(keys);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('accepts a list of chords and fires once for whichever matched', async () => {
    const handler = vi.fn();
    renderHook(() => useChordHotkey(['Alt+Shift+S', 'Control+K'], handler));

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(handler).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Alt>}{Shift>}s{/Shift}{/Alt}');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('never fires for a chord with no key part', async () => {
    // "Alt+Shift" alone would otherwise swallow every keystroke held with
    // those two modifiers.
    const handler = vi.fn();
    renderHook(() => useChordHotkey('Alt+Shift', handler));

    await userEvent.keyboard('{Alt>}{Shift>}s{/Shift}{/Alt}');

    expect(handler).not.toHaveBeenCalled();
  });

  it('preventDefaults the match so the browser shortcut does not also run', async () => {
    const handler = vi.fn();
    renderHook(() => useChordHotkey('Control+K', handler));

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(handler.mock.calls[0][0].defaultPrevented).toBe(true);
  });

  it('does not listen at all when disabled', async () => {
    const handler = vi.fn();
    renderHook(() => useChordHotkey('Control+K', handler, { enabled: false }));

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(handler).not.toHaveBeenCalled();
  });

  it('listens on an explicit target and not on the rest of the document', async () => {
    const handler = vi.fn();

    render(
      <div>
        <input aria-label="scoped" />
        <input aria-label="outside" />
      </div>,
    );
    const scoped = screen.getByRole('textbox', { name: 'scoped' }) as HTMLInputElement;
    renderHook(() => useChordHotkey('Control+K', handler, { target: scoped }));

    await userEvent.click(screen.getByRole('textbox', { name: 'outside' }));
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(handler).not.toHaveBeenCalled();

    await userEvent.click(scoped);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('stops listening once unmounted', async () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useChordHotkey('Control+K', handler));

    unmount();
    await userEvent.keyboard('{Control>}k{/Control}');

    expect(handler).not.toHaveBeenCalled();
  });

  it('uses the latest handler without re-subscribing', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handler }: { handler: (e: KeyboardEvent) => void }) => useChordHotkey('Control+K', handler),
      { initialProps: { handler: first } },
    );

    rerender({ handler: second });
    await userEvent.keyboard('{Control>}k{/Control}');

    // A stale closure here is how dev tooling ends up toggling state that no
    // longer exists after a re-render.
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
