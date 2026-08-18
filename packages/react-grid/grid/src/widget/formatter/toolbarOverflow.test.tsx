import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import {
  computeHiddenSegments,
  useToolbarOverflow,
  type OverflowSpec,
} from './toolbarOverflow';

const SPEC: OverflowSpec = {
  order: ['font', 'number', 'align', 'borders', 'column', 'templates'],
  collapseOrder: ['templates', 'column', 'borders', 'align', 'number', 'font'],
};

function widths(map: Record<string, number>): ReadonlyMap<string, number> {
  return new Map(Object.entries(map));
}

const ALL_100 = widths({
  font: 100, number: 100, align: 100, borders: 100, column: 100, templates: 100,
});

describe('computeHiddenSegments', () => {
  it('hides nothing when every segment fits', () => {
    // 6×100 + 5×8 = 640
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 640, gap: 8, overflowTriggerWidth: 36,
    });
    expect(hidden.size).toBe(0);
  });

  it('collapses in the declared order, accounting for the ⋯ trigger', () => {
    // 640 needed; 600 available. Hiding templates leaves 5×100+4×8=532,
    // + trigger 36 + gap 8 = 576 ≤ 600 → only templates hides.
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 600, gap: 8, overflowTriggerWidth: 36,
    });
    expect([...hidden]).toEqual(['templates']);
  });

  it('keeps collapsing until the row plus trigger fits', () => {
    // 400 available: hide templates (532+44=576 > 400), column
    // (424+44=468 > 400), borders (316+44=360 ≤ 400) → three hidden.
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 400, gap: 8, overflowTriggerWidth: 36,
    });
    expect([...hidden]).toEqual(['templates', 'column', 'borders']);
  });

  it('hides every collapsible segment when nothing fits', () => {
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 10, gap: 8, overflowTriggerWidth: 36,
    });
    expect(hidden.size).toBe(SPEC.collapseOrder.length);
  });

  it('shows everything when the container is unmeasured (jsdom guard)', () => {
    expect(
      computeHiddenSegments(SPEC, {
        widths: ALL_100, available: 0, gap: 8, overflowTriggerWidth: 36,
      }).size,
    ).toBe(0);
    expect(
      computeHiddenSegments(SPEC, {
        widths: ALL_100, available: Number.NaN, gap: 8, overflowTriggerWidth: 36,
      }).size,
    ).toBe(0);
  });

  it('treats never-measured segments as zero width (stay visible)', () => {
    const hidden = computeHiddenSegments(SPEC, {
      widths: widths({ font: 100 }), available: 200, gap: 8, overflowTriggerWidth: 36,
    });
    // font 100 + five zero-width segments + 5 gaps = 140 ≤ 200.
    expect(hidden.size).toBe(0);
  });

  it('only counts ids from `order` toward the row width', () => {
    const hidden = computeHiddenSegments(
      { order: ['a', 'b'], collapseOrder: ['b', 'a'] },
      {
        widths: widths({ a: 50, b: 50, ghost: 5000 }),
        available: 108,
        gap: 8,
        overflowTriggerWidth: 36,
      },
    );
    expect(hidden.size).toBe(0);
  });
});

/**
 * The measurement layer. jsdom reports every element as 0×0, so each case
 * below supplies the widths a browser would — that is exactly the input the
 * hook is responsible for gathering and feeding to the pure partition.
 *
 * The refs are attached through JSX, as the toolbar attaches them: the hook's
 * layout effect reads them on the same commit, so poking them after render
 * would measure a row that never existed.
 */
describe('useToolbarOverflow', () => {
  /** Give one element the size jsdom will not. */
  function size(el: HTMLElement, width: number) {
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
  }

  let fireResize: (() => void) | undefined;
  let observed = 0;
  let disconnected = 0;
  const realRO = globalThis.ResizeObserver;

  class FakeResizeObserver {
    constructor(cb: () => void) {
      fireResize = cb;
    }
    observe() {
      observed += 1;
    }
    disconnect() {
      disconnected += 1;
    }
    unobserve() {}
  }

  beforeEach(() => {
    fireResize = undefined;
    observed = 0;
    disconnected = 0;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
  });

  afterEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = realRO;
    cleanup();
  });

  interface RowProps {
    /** Container width. A box lets a case shrink the row mid-life the way a
     *  real resize does — a plain number would be re-applied by the ref
     *  callback on the next commit and undo the shrink. */
    container: number | { current: number };
    segments?: Record<string, number>;
    lead?: number;
    trail?: number;
    /** Ids to leave out of the DOM, as a collapsed segment would be. */
    absent?: readonly string[];
  }

  let latest: ReturnType<typeof useToolbarOverflow>;

  function Row({ container, segments = {}, lead, trail, absent = [] }: RowProps) {
    const o = useToolbarOverflow(SPEC, { gap: 8, overflowTriggerWidth: 36 });
    latest = o;
    const sized = (width: number | undefined, ref: { current: HTMLElement | null }) =>
      (el: HTMLDivElement | null) => {
        if (el && width !== undefined) size(el, width);
        ref.current = el;
      };
    const containerWidth = typeof container === 'number' ? container : container.current;
    return (
      <div ref={sized(containerWidth, o.containerRef)}>
        <div ref={sized(lead, o.leadRef)} />
        <div ref={sized(trail, o.trailRef)} />
        {Object.entries(segments)
          .filter(([id]) => !absent.includes(id))
          .map(([id, width]) => (
            <div
              key={id}
              ref={(el) => {
                if (el) size(el, width);
                o.registerSegment(id)(el);
              }}
            />
          ))}
      </div>
    );
  }

  const ALL = { font: 100, number: 100, align: 100, borders: 100, column: 100, templates: 100 };

  it('hides nothing while the container is unmeasured', () => {
    render(<Row container={0} segments={{ font: 100 }} />);
    expect(latest.hidden.size).toBe(0);
  });

  it('hides nothing when the whole row fits', () => {
    render(<Row container={2000} segments={ALL} />);
    expect(latest.hidden.size).toBe(0);
  });

  it('collapses the trailing segments when the row is narrow', () => {
    render(<Row container={400} segments={ALL} />);

    expect(latest.hidden.size).toBeGreaterThan(0);
    // Collapse order first, so templates goes before font.
    expect(latest.hidden.has('templates')).toBe(true);
    expect(latest.hidden.has('font')).toBe(false);
  });

  it('charges the lead and trail clusters against the available row', () => {
    const { unmount } = render(<Row container={700} segments={{ font: 100, number: 100, align: 100, borders: 100 }} />);
    expect(latest.hidden.size).toBe(0);
    unmount();

    render(
      <Row
        container={700}
        segments={{ font: 100, number: 100, align: 100, borders: 100 }}
        lead={250}
        trail={150}
      />,
    );
    expect(latest.hidden.size).toBeGreaterThan(0);
  });

  it("remembers a hidden segment's width so it can come back", () => {
    // A collapsed segment leaves the DOM; the cached width is what lets the
    // partition restore it when the toolbar grows.
    const { rerender } = render(<Row container={400} segments={ALL} />);
    const collapsed = [...latest.hidden];
    expect(collapsed.length).toBeGreaterThan(0);

    rerender(<Row container={2000} segments={ALL} absent={collapsed} />);
    expect(latest.hidden.size).toBe(0);
  });

  it('ignores a segment measuring zero rather than caching the zero', () => {
    const { rerender } = render(<Row container={400} segments={ALL} />);
    const before = new Set(latest.hidden);

    rerender(<Row container={400} segments={{ ...ALL, font: 0 }} />);
    expect(new Set(latest.hidden)).toEqual(before);
  });

  it('does nothing at all without a container', () => {
    const { result } = renderHook(() => useToolbarOverflow(SPEC));
    expect(result.current.hidden.size).toBe(0);
  });

  it('watches both the container and the lead cluster', () => {
    render(<Row container={800} segments={{ font: 100 }} lead={50} />);
    expect(observed).toBe(2);
  });

  it('re-partitions on a resize notification', async () => {
    const box = { current: 2000 };
    render(<Row container={box} segments={ALL} />);
    expect(latest.hidden.size).toBe(0);

    box.current = 300;
    size(latest.containerRef.current!, 300);
    await act(async () => {
      fireResize?.();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    });

    expect(latest.hidden.size).toBeGreaterThan(0);
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Row container={800} segments={{ font: 100 }} />);
    unmount();
    expect(disconnected).toBeGreaterThan(0);
  });

  it('runs without a ResizeObserver at all', () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    render(<Row container={800} segments={{ font: 100 }} />);

    expect(latest.hidden.size).toBe(0);
    expect(observed).toBe(0);
  });
});
