/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LaneDef } from '@wellsfargo-starui/data';
import { LaneChart, laneToneVar } from './LaneChart.js';

const ROWS = [
  { t: '09:00', pnl: 10, notional: 100, venue: 'LDN' },
  { t: '10:00', pnl: -5, notional: 300, venue: 'LDN' },
  { t: '11:00', pnl: 25, notional: 200, venue: 'NYC' },
  { t: '12:00', pnl: 0, notional: 400, venue: 'NYC' },
];

const LANES: LaneDef[] = [
  { label: 'P&L', column: 'pnl', mark: 'line', tone: 'ramp-1', weight: 1 },
  { label: 'NOTIONAL', column: 'notional', mark: 'bars', tone: 'ramp-2', weight: 1 },
];

function laneSvgs(container: HTMLElement): SVGElement[] {
  return [...container.querySelectorAll('svg')] as SVGElement[];
}

describe('LaneChart', () => {
  it('draws one track per lane, each labelled', () => {
    const { container } = render(<LaneChart rows={ROWS} axis="t" lanes={LANES} />);
    expect(laneSvgs(container)).toHaveLength(2);
    expect(screen.getByText('P&L')).toBeTruthy();
    expect(screen.getByText('NOTIONAL')).toBeTruthy();
  });

  /**
   * The premise of the whole component. Independent charts each compute their
   * own plot area and drift apart by a few pixels; one shared viewBox means a
   * given row index is at the same x in every lane by construction.
   */
  it('gives every lane the same user-space width, so a row index lands at the same x in all of them', () => {
    const { container } = render(<LaneChart rows={ROWS} axis="t" lanes={LANES} />);
    const widths = laneSvgs(container).map((s) => s.getAttribute('viewBox')?.split(' ')[2]);
    expect(new Set(widths).size).toBe(1);
  });

  it('rules every lane at the same division positions', () => {
    const { container } = render(<LaneChart rows={ROWS} axis="t" lanes={LANES} />);
    const xsPerLane = laneSvgs(container).map((svg) =>
      [...svg.querySelectorAll('line')].map((l) => l.getAttribute('x1')).join(','),
    );
    expect(new Set(xsPerLane).size).toBe(1);
  });

  it('labels the shared axis from the axis column, once for the whole stack', () => {
    render(<LaneChart rows={ROWS} axis="t" lanes={LANES} />);
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('12:00')).toBeTruthy();
  });

  it('scales a lane taller when it carries more weight', () => {
    const { container } = render(
      <LaneChart
        rows={ROWS}
        axis="t"
        lanes={[LANES[0], { ...LANES[1], weight: 3 }]}
      />,
    );
    const [first, second] = laneSvgs(container).map((s) => Number(s.getAttribute('viewBox')?.split(' ')[3]));
    expect(second).toBe(first * 3);
  });

  describe('marks', () => {
    it('draws a line lane as a single path', () => {
      const { container } = render(<LaneChart rows={ROWS} axis="t" lanes={[LANES[0]]} />);
      expect(container.querySelectorAll('path')).toHaveLength(1);
      expect(container.querySelectorAll('rect')).toHaveLength(0);
    });

    it('draws an area lane as a filled shape under its line', () => {
      const { container } = render(
        <LaneChart rows={ROWS} axis="t" lanes={[{ ...LANES[0], mark: 'area' }]} />,
      );
      expect(container.querySelectorAll('path')).toHaveLength(2);
      expect(container.querySelector('linearGradient')).toBeTruthy();
    });

    it('draws a bars lane as one rect per row', () => {
      const { container } = render(<LaneChart rows={ROWS} axis="t" lanes={[LANES[1]]} />);
      expect(container.querySelectorAll('rect')).toHaveLength(ROWS.length);
    });

    /**
     * A reader should see "at the desk all afternoon" as one fact, not as
     * forty adjacent samples — so runs of the same value collapse into one
     * block.
     */
    it('collapses a state lane into one block per run', () => {
      const { container } = render(
        <LaneChart rows={ROWS} axis="t" lanes={[{ label: 'VENUE', column: 'venue', mark: 'state' }]} />,
      );
      // Four rows, two runs (LDN, LDN, NYC, NYC).
      expect(container.querySelectorAll('rect')).toHaveLength(2);
    });
  });

  describe('colour', () => {
    /** The reference is a dark-only print piece; every surface here has to
     *  render under both themes and pass `check:ds-tokens`. */
    it('resolves every tone to a design token, never a literal colour', () => {
      for (const tone of ['ramp-1', 'ramp-5', 'positive', 'negative'] as const) {
        expect(laneToneVar(tone)).toMatch(/^var\(--ds-[a-z0-9-]+\)$/);
      }
    });

    it('falls back to the first ramp step for an unset tone', () => {
      expect(laneToneVar(undefined)).toBe('var(--ds-chart-1)');
    });
  });

  describe('degenerate input', () => {
    it('says so rather than drawing an empty frame when there are no rows', () => {
      render(<LaneChart rows={[]} axis="t" lanes={LANES} />);
      expect(screen.getByText(/no rows/i)).toBeTruthy();
    });

    /** A flat lane has a zero range; without a floor it divides by zero and
     *  the track disappears. */
    it('still draws a lane whose every value is identical', () => {
      const flat = ROWS.map((r) => ({ ...r, pnl: 7 }));
      const { container } = render(<LaneChart rows={flat} axis="t" lanes={[LANES[0]]} />);
      const d = container.querySelector('path')?.getAttribute('d') ?? '';
      expect(d).not.toContain('NaN');
      expect(d.length).toBeGreaterThan(0);
    });

    it('does not produce NaN geometry from a single row', () => {
      const { container } = render(<LaneChart rows={[ROWS[0]]} axis="t" lanes={LANES} />);
      expect(container.innerHTML).not.toContain('NaN');
    });

    it('treats a missing or non-numeric cell as zero rather than breaking the path', () => {
      const holey = [{ t: 'a', pnl: 5 }, { t: 'b' }, { t: 'c', pnl: 'n/a' }, { t: 'd', pnl: 9 }];
      const { container } = render(<LaneChart rows={holey} axis="t" lanes={[LANES[0]]} />);
      expect(container.querySelector('path')?.getAttribute('d')).not.toContain('NaN');
    });
  });
});
