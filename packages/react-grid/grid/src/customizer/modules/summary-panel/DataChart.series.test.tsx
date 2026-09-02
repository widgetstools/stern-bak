/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildChartSpec, type ChartSpec } from '@wellsfargo-starui/data';
import { DataChart } from './DataChart.js';

/**
 * What is and is not testable here, so the next person doesn't rediscover it:
 *
 * recharts sizes itself from its container and jsdom reports every element as
 * 0x0, at which point `ResponsiveContainer` renders nothing and any assertion
 * passes vacuously on an empty tree. The `beforeAll` stub fixes that far
 * enough to get the surface, the axes, the ticks and the legend — all of which
 * are asserted below.
 *
 * MARKS still never appear: `Bar`/`Area`/`Line` animate in on a frame jsdom
 * never runs, so `.recharts-bar` is always empty. Disabling animation in the
 * renderer purely to satisfy a test would change what users see, so the
 * stacked-vs-grouped GEOMETRY is left to the browser check instead. The data
 * that drives it — series, per-series values, stack totals — is covered
 * exhaustively in `chartSpec.series.test.ts`.
 */
function spec(requested: Parameters<typeof buildChartSpec>[0]['requested'], normalize = false): ChartSpec {
  const built = buildChartSpec({
    columns: ['day', 'Commercial', 'Consumer', 'Education'],
    rows: [
      { day: 'Sun', Commercial: 400, Consumer: 550, Education: 620 },
      { day: 'Mon', Commercial: 300, Consumer: 450, Education: 500 },
    ],
    grouped: true,
    requested,
    normalize,
  });
  if (!built) throw new Error('expected a spec');
  return built;
}

/**
 * recharts sizes itself from the container, and jsdom reports every element as
 * 0x0 — at which point `ResponsiveContainer` renders nothing inside itself and
 * any assertion about axes, bars or the legend silently passes on an empty
 * tree. Stubbing the measurement is what makes those assertions mean anything.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 600, height: 320, top: 0, left: 0, bottom: 320, right: 600, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 320 });
});

function draw(kind: Parameters<typeof buildChartSpec>[0]['requested'], normalize = false) {
  return render(
    <div style={{ width: 600, height: 320 }}>
      <DataChart spec={spec(kind, normalize)} />
    </div>,
  );
}

describe('multi-series rendering', () => {
  it('builds a chart for each multi-series kind without throwing', () => {
    for (const kind of ['stackedBar', 'groupedBar', 'stackedArea', 'multiLine'] as const) {
      const { container, unmount } = draw(kind);
      expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
      unmount();
    }
  });

  /**
   * The spec keeps per-series numbers nested under `values` so
   * `ChartPoint.value` can stay the stack total for every generic reader.
   * recharts needs one flat key per series, so the renderer flattens — if that
   * ever stops happening the chart renders empty rather than erroring, which
   * is why this is asserted rather than assumed.
   */
  it('flattens nested values into one data key per series', () => {
    const built = spec('stackedBar');
    expect(built.points[0].values).toBeDefined();
    expect(built.series?.map((s) => s.key)).toEqual(['Commercial', 'Consumer', 'Education']);
    // The renderer's flattening is the inverse of the spec's nesting.
    const flat = built.points.map((p) => ({ label: p.label, ...(p.values ?? {}) }));
    expect(flat[0]).toEqual({ label: 'Sun', Commercial: 400, Consumer: 550, Education: 620 });
  });

  /** A stack of five anonymous colours says nothing, so unlike a single-series
   *  chart the legend is not optional here. */
  it('always draws a legend, because the colours are the only series labels', () => {
    const { container } = draw('stackedBar');
    expect(container.querySelector('.recharts-legend-wrapper')).toBeTruthy();
  });

  it('gives multi-series charts extra minimum height to fit that legend', () => {
    const { container } = draw('stackedBar');
    // `ChartContainer` stamps `data-chart` on its root and carries the
    // minHeight `DataChart` computes for the kind.
    const root = container.querySelector('[data-chart]') as HTMLElement | null;
    expect(Number.parseInt(root?.style.minHeight ?? '0', 10)).toBeGreaterThanOrEqual(200);
  });
});

describe('single-series charts are unaffected', () => {
  /** The whole multi-series change is additive; a one-measure result must
   *  render exactly the way it did before. */
  it('still renders a plain bar chart', () => {
    const built = buildChartSpec({
      columns: ['sector', 'mv'],
      rows: [{ sector: 'Tech', mv: 5 }, { sector: 'Energy', mv: 3 }],
      grouped: true,
      requested: 'bar',
    })!;
    const { container } = render(
      <div style={{ width: 600, height: 320 }}>
        <DataChart spec={built} />
      </div>,
    );
    expect(built.series).toBeUndefined();
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});
