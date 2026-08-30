/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { useBlotterVisibilityGuard } from './useBlotterVisibilityGuard.js';

type CapturedCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
let resizeCallback: CapturedCallback | null = null;

class FakeResizeObserver {
  constructor(cb: CapturedCallback) {
    resizeCallback = cb;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function makeFakeApi(): GridApi {
  return {
    getColumnState: vi.fn(() => []),
    getFilterModel: vi.fn(() => ({})),
    getFirstDisplayedRowIndex: vi.fn(() => 0),
    applyColumnState: vi.fn(),
    setFilterModel: vi.fn(),
    ensureIndexVisible: vi.fn(),
  } as unknown as GridApi;
}

function Harness({ apiRef }: { apiRef: { current: GridApi | null } }) {
  const { isMounted, containerRef } = useBlotterVisibilityGuard('blotter', () => apiRef.current);
  return (
    <div ref={containerRef} data-testid="container">
      {isMounted ? <div data-testid="grid-content">GRID</div> : null}
    </div>
  );
}

describe('useBlotterVisibilityGuard', () => {
  const OriginalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    resizeCallback = null;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = OriginalResizeObserver;
  });

  it('starts mounted', () => {
    render(<Harness apiRef={{ current: makeFakeApi() }} />);
    expect(screen.getByTestId('grid-content')).toBeTruthy();
  });

  it('tears down and saves grid state when a sibling tab in the same group is clicked', () => {
    const api = makeFakeApi();
    const { container } = render(
      <div className="dock-tab-group">
        <button className="dock-tab" data-tab-id="blotter">Blotter</button>
        <button className="dock-tab" data-tab-id="other">Other</button>
        <Harness apiRef={{ current: api }} />
      </div>,
    );

    fireEvent.pointerDown(container.querySelector('[data-tab-id="other"]')!);

    expect(screen.queryByTestId('grid-content')).toBeNull();
    expect(api.getColumnState).toHaveBeenCalledTimes(1);
    expect(api.getFilterModel).toHaveBeenCalledTimes(1);
    expect(api.getFirstDisplayedRowIndex).toHaveBeenCalledTimes(1);
  });

  it('ignores a click on its own tab', () => {
    const { container } = render(
      <div className="dock-tab-group">
        <button className="dock-tab" data-tab-id="blotter">Blotter</button>
        <Harness apiRef={{ current: makeFakeApi() }} />
      </div>,
    );

    fireEvent.pointerDown(container.querySelector('[data-tab-id="blotter"]')!);

    expect(screen.getByTestId('grid-content')).toBeTruthy();
  });

  it('ignores a click in an unrelated tab group', () => {
    const { container } = render(
      <div>
        <div className="dock-tab-group">
          <button className="dock-tab" data-tab-id="unrelated">Unrelated</button>
        </div>
        <div className="dock-tab-group">
          <button className="dock-tab" data-tab-id="blotter">Blotter</button>
          <Harness apiRef={{ current: makeFakeApi() }} />
        </div>
      </div>,
    );

    fireEvent.pointerDown(container.querySelector('[data-tab-id="unrelated"]')!);

    expect(screen.getByTestId('grid-content')).toBeTruthy();
  });

  it('remounts once its container is observed at a non-zero width', () => {
    const { container } = render(
      <div className="dock-tab-group">
        <button className="dock-tab" data-tab-id="blotter">Blotter</button>
        <button className="dock-tab" data-tab-id="other">Other</button>
        <Harness apiRef={{ current: makeFakeApi() }} />
      </div>,
    );

    fireEvent.pointerDown(container.querySelector('[data-tab-id="other"]')!);
    expect(screen.queryByTestId('grid-content')).toBeNull();
    expect(resizeCallback).toBeTruthy();

    act(() => {
      resizeCallback!([{ contentRect: { width: 400 } }]);
    });

    expect(screen.getByTestId('grid-content')).toBeTruthy();
  });

  it('does not remount while the observed width stays zero', () => {
    const { container } = render(
      <div className="dock-tab-group">
        <button className="dock-tab" data-tab-id="blotter">Blotter</button>
        <button className="dock-tab" data-tab-id="other">Other</button>
        <Harness apiRef={{ current: makeFakeApi() }} />
      </div>,
    );

    fireEvent.pointerDown(container.querySelector('[data-tab-id="other"]')!);
    act(() => {
      resizeCallback!([{ contentRect: { width: 0 } }]);
    });

    expect(screen.queryByTestId('grid-content')).toBeNull();
  });
});
