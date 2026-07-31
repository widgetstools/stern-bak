import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, type RenderResult } from '@testing-library/react';
import { useCallback, useRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  useRestoreCellFocusOnWindowFocus,
  type RestoreCellFocusBridge,
} from './useRestoreCellFocusOnWindowFocus';

const LAST_FOCUSED_DOC_KEY = 'starui-grid:last-focused-doc';

interface FakeApiOverrides {
  focusedCell?: { rowIndex: number; column: unknown; rowPinned: 'top' | 'bottom' | null } | null;
  editingCells?: unknown[];
  destroyed?: boolean;
}

const COLUMN = { getColId: () => 'price' };

function makeFakeApi(overrides: FakeApiOverrides = {}) {
  const {
    focusedCell = { rowIndex: 3, column: COLUMN, rowPinned: null },
    editingCells = [],
    destroyed = false,
  } = overrides;
  return {
    isDestroyed: () => destroyed,
    getFocusedCell: () => focusedCell,
    getEditingCells: () => editingCells,
    setFocusedCell: vi.fn(),
  };
}

function makeFakeBridge() {
  let cb: (() => void) | null = null;
  const unsubscribe = vi.fn(() => {
    cb = null;
  });
  const focusHostWebContents = vi.fn();
  const bridge: RestoreCellFocusBridge = {
    subscribeParentWindowFocused: (c) => {
      cb = c;
      return unsubscribe;
    },
    focusHostWebContents,
  };
  return {
    bridge,
    focusHostWebContents,
    unsubscribe,
    fireParentWindowFocused: () => cb?.(),
  };
}

function Harness({
  api,
  bridge,
}: {
  api: ReturnType<typeof makeFakeApi>;
  bridge: RestoreCellFocusBridge;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const getApi = useCallback(() => api as unknown as GridApi, [api]);
  useRestoreCellFocusOnWindowFocus(rootRef, getApi, bridge);
  return (
    <div ref={rootRef} data-testid="surface">
      {/* Stand-in for the focused AG cell: carries .ag-cell so the hook
          recognises focus landing on it as "restored". */}
      <button data-testid="cell" className="ag-cell">
        cell
      </button>
      <button data-testid="non-cell">non-cell chrome</button>
    </div>
  );
}

/** Render + make setFocusedCell actually focus the stand-in cell, like AG Grid's forceBrowserFocus. */
function renderHarness(api: ReturnType<typeof makeFakeApi>, bridge: RestoreCellFocusBridge): RenderResult {
  const view = render(<Harness api={api} bridge={bridge} />);
  api.setFocusedCell.mockImplementation(() => view.getByTestId('cell').focus());
  return view;
}

function focusInOnCell(view: RenderResult) {
  view.getByTestId('cell').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

function refocusWindow() {
  window.dispatchEvent(new Event('focus'));
  vi.runAllTimers();
}

describe('useRestoreCellFocusOnWindowFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-focuses the focused cell when the window regains focus and DOM focus fell to <body>', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    // jsdom's default activeElement is <body> — the alt-tab-return state.
    expect(document.activeElement).toBe(document.body);

    refocusWindow();

    expect(api.setFocusedCell).toHaveBeenCalledTimes(1);
    expect(api.setFocusedCell).toHaveBeenCalledWith(3, COLUMN, null);
    expect(document.activeElement).toBe(view.getByTestId('cell'));
  });

  it('does nothing when the grid never owned focus', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    renderHarness(api, bridge);

    refocusWindow();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
  });

  it('does not steal focus that deliberately moved outside the grid', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);
    const outside = document.createElement('input');
    document.body.appendChild(outside);

    focusInOnCell(view);
    view.getByTestId('cell').dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );

    refocusWindow();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
    outside.remove();
  });

  it('does not steal focus the browser restored to an element outside the grid', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);
    const outside = document.createElement('input');
    document.body.appendChild(outside);

    focusInOnCell(view);
    outside.focus(); // browser restored focus elsewhere; activeElement is not <body>

    refocusWindow();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
    outside.remove();
  });

  it('does nothing when the browser already restored the cell itself', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    view.getByTestId('cell').focus();

    refocusWindow();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
  });

  it('re-asserts the cell when focus landed inside the grid but not on a cell', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    view.getByTestId('non-cell').focus();

    refocusWindow();

    expect(api.setFocusedCell).toHaveBeenCalledTimes(1);
  });

  it('keeps ownership across a focusout with no relatedTarget (window blur)', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    view.getByTestId('cell').dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
    );

    refocusWindow();

    expect(api.setFocusedCell).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the grid reports no focused cell', () => {
    const api = makeFakeApi({ focusedCell: null });
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    refocusWindow();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
  });

  it('skips restoration while a cell editor is open', () => {
    const api = makeFakeApi({ editingCells: [{}] });
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    refocusWindow();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
  });

  it('skips restoration when the grid api is destroyed', () => {
    const api = makeFakeApi({ destroyed: true });
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    refocusWindow();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
  });

  it('restores via the parent OpenFin window focused event when the DOM window never refocuses', () => {
    const api = makeFakeApi();
    const fake = makeFakeBridge();
    const view = renderHarness(api, fake.bridge);

    focusInOnCell(view);
    fake.fireParentWindowFocused(); // no DOM window `focus` event at all
    vi.runAllTimers();

    expect(api.setFocusedCell).toHaveBeenCalledTimes(1);
  });

  it('hands web-contents focus back to the view when the document has no focus', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const api = makeFakeApi();
    const fake = makeFakeBridge();
    const view = renderHarness(api, fake.bridge);

    focusInOnCell(view);
    fake.fireParentWindowFocused();
    vi.runAllTimers();

    expect(fake.focusHostWebContents).toHaveBeenCalled();
    expect(api.setFocusedCell).toHaveBeenCalledTimes(1);
  });

  it('defers to another document that was focused more recently (multi-view fleet)', () => {
    const api = makeFakeApi();
    const fake = makeFakeBridge();
    const view = renderHarness(api, fake.bridge);

    focusInOnCell(view); // stamps this document
    localStorage.setItem(LAST_FOCUSED_DOC_KEY, 'some-other-view'); // another view focused after us

    fake.fireParentWindowFocused();
    vi.runAllTimers();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
  });

  it('intra-grid focus moves do not rewrite the localStorage stamp (fleet storage-event storm guard)', () => {
    const api = makeFakeApi();
    const fake = makeFakeBridge();
    const view = renderHarness(api, fake.bridge);
    focusInOnCell(view); // ownership transition → stamps once
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // Arrow-key navigation: focus moves cell→cell INSIDE the grid —
    // ownership is retained, so no further writes may occur.
    focusInOnCell(view);
    focusInOnCell(view);
    focusInOnCell(view);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('a real DOM window focus re-claims the last-focused stamp', () => {
    const api = makeFakeApi();
    const { bridge } = makeFakeBridge();
    const view = renderHarness(api, bridge);

    focusInOnCell(view);
    localStorage.setItem(LAST_FOCUSED_DOC_KEY, 'some-other-view');

    // The DOM window focus event means THIS document is the active one.
    refocusWindow();

    expect(api.setFocusedCell).toHaveBeenCalledTimes(1);
  });

  it('removes listeners and unsubscribes the bridge on unmount', () => {
    const api = makeFakeApi();
    const fake = makeFakeBridge();
    const view = renderHarness(api, fake.bridge);

    focusInOnCell(view);
    view.unmount();

    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    refocusWindow();
    fake.fireParentWindowFocused();
    vi.runAllTimers();

    expect(api.setFocusedCell).not.toHaveBeenCalled();
  });
});
