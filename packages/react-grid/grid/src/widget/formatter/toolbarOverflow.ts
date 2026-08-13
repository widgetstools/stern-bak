/**
 * Responsive overflow for the horizontal formatter toolbar.
 *
 * The toolbar renders labeled segments (FONT, NUMBER, ALIGN, Borders,
 * Column, Templates, …) in a single row. When the grid is narrow the
 * trailing segments collapse — in a declared priority order — into a
 * "⋯" overflow menu instead of clipping or wrapping.
 *
 * Split in two layers so the partition logic is unit-testable without
 * a DOM:
 *
 *   - {@link computeHiddenSegments} — pure: given segment widths, the
 *     available row width, and the collapse order, returns the set of
 *     segment ids that must move into the overflow menu.
 *   - {@link useToolbarOverflow} — measurement: caches each segment's
 *     natural width while it is visible (a hidden segment leaves the
 *     DOM, so its cached width is what lets it come back when the
 *     toolbar grows), watches the container with a ResizeObserver, and
 *     re-partitions on every layout pass.
 *
 * jsdom guard: an unmeasured container reports width 0 → the partition
 * returns "nothing hidden", so unit tests exercise the full inline
 * toolbar without needing layout.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface OverflowSpec {
  /** Segment ids in DOM order. */
  order: readonly string[];
  /** Ids in the order they collapse (first entry hides first). */
  collapseOrder: readonly string[];
}

export interface OverflowGeometry {
  /** Natural width per segment id (cached live measurements). */
  widths: ReadonlyMap<string, number>;
  /** Row width left for segments (container minus lead/trail/padding). */
  available: number;
  /** Flex gap between adjacent row items. */
  gap: number;
  /** Width the ⋯ trigger adds once anything is hidden (incl. its gap). */
  overflowTriggerWidth: number;
}

export function computeHiddenSegments(
  spec: OverflowSpec,
  geo: OverflowGeometry,
): ReadonlySet<string> {
  const { order, collapseOrder } = spec;
  const { widths, available, gap, overflowTriggerWidth } = geo;

  // Unmeasured / collapsed container (jsdom, display:none) → show all.
  if (!Number.isFinite(available) || available <= 0) return new Set();

  const width = (id: string) => widths.get(id) ?? 0;
  const visible = new Set(order);
  const rowWidth = () => {
    let sum = 0;
    let n = 0;
    for (const id of order) {
      if (!visible.has(id)) continue;
      sum += width(id);
      n += 1;
    }
    return n > 0 ? sum + gap * (n - 1) : 0;
  };

  if (rowWidth() <= available) return new Set();

  const hidden = new Set<string>();
  for (const id of collapseOrder) {
    if (!visible.has(id)) continue;
    visible.delete(id);
    hidden.add(id);
    const trigger = overflowTriggerWidth + (visible.size > 0 ? gap : 0);
    if (rowWidth() + trigger <= available) break;
  }
  return hidden;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export interface UseToolbarOverflowResult {
  /** Attach to the flex row that hosts the segments. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the fixed leading cluster (scope/target/caption). */
  leadRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the fixed trailing cluster (popout/close). */
  trailRef: React.RefObject<HTMLDivElement | null>;
  /** Ref callback factory for each segment wrapper. */
  registerSegment: (id: string) => (el: HTMLElement | null) => void;
  /** Segment ids currently collapsed into the overflow menu. */
  hidden: ReadonlySet<string>;
}

export function useToolbarOverflow(
  spec: OverflowSpec,
  opts?: { gap?: number; overflowTriggerWidth?: number },
): UseToolbarOverflowResult {
  const gap = opts?.gap ?? 6; // matches .fx-bar's CSS gap
  const overflowTriggerWidth = opts?.overflowTriggerWidth ?? 36;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const leadRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);
  const segmentEls = useRef(new Map<string, HTMLElement | null>());
  const widthCache = useRef(new Map<string, number>());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const registerSegment = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      segmentEls.current.set(id, el);
    },
    [],
  );

  const specRef = useRef(spec);
  specRef.current = spec;

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) {
      setHidden((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    // Refresh the width cache from whatever is currently measurable.
    for (const [id, el] of segmentEls.current) {
      if (el && el.offsetWidth > 0) widthCache.current.set(id, el.offsetWidth);
    }

    const styles = window.getComputedStyle(container);
    const padding =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0);
    const leadWidth = leadRef.current?.offsetWidth ?? 0;
    const trailWidth = trailRef.current?.offsetWidth ?? 0;
    // Reserve three inter-cluster gaps (lead↔segments, segments↔readout,
    // readout↔trail) — slightly conservative beats one-frame clipping.
    const reserved = padding + leadWidth + trailWidth + gap * 3;

    const next = computeHiddenSegments(specRef.current, {
      widths: widthCache.current,
      available: containerWidth - reserved,
      gap,
      overflowTriggerWidth,
    });
    setHidden((prev) => (sameSet(prev, next) ? prev : next));
  }, [gap, overflowTriggerWidth]);

  // Re-partition on every commit — segment content changes width with
  // state (decimals readout, select values, caption rename). The
  // sameSet guard makes the loop convergent, and the reads are a
  // handful of offsetWidths.
  useLayoutEffect(() => {
    recompute();
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recompute);
    });
    observer.observe(container);
    if (leadRef.current) observer.observe(leadRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [recompute]);

  return { containerRef, leadRef, trailRef, registerSegment, hidden };
}
