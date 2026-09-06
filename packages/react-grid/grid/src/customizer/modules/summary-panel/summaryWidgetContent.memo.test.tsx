/**
 * @vitest-environment jsdom
 *
 * The guarantee behind the dock-drag fix.
 *
 * `runQuery` / `summariseRows` used to run in the card render bodies. Dockview
 * re-renders its panels while a drag is in progress, so every frame of a drag
 * re-aggregated the whole row set synchronously on the main thread — which is
 * what made dragging a panel sluggish on a large blotter under Windows.
 *
 * These tests assert the property that fixes it: a re-render that is not about
 * data does ZERO aggregation. They count real calls into the query engine, so
 * they fail if the memo is removed or its key is widened back to `rows`.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const runQuerySpy = vi.fn();
const summariseSpy = vi.fn();

vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/data')>();
  return {
    ...actual,
    runQuery: (...args: Parameters<typeof actual.runQuery>) => {
      runQuerySpy();
      return actual.runQuery(...args);
    },
    summariseRows: (...args: Parameters<typeof actual.summariseRows>) => {
      summariseSpy();
      return actual.summariseRows(...args);
    },
  };
});

vi.mock('@wellsfargo-starui/react/chart', () => ({
  ChartContainer: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
  ChartLegend: () => null,
  ChartLegendContent: () => null,
}));

vi.mock('recharts', () => {
  const el = (tag: string) => ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', { 'data-testid': tag }, children);
  return new Proxy({}, { get: (_t, key: string) => el(key) });
});

import { SummaryWidgetContent } from './summaryWidgetContent.js';
import type { SummaryWidget } from './index.js';

const ROWS = [
  { sector: 'Tech', marketValue: 100 },
  { sector: 'Energy', marketValue: 50 },
];

const TABLE_WIDGET: SummaryWidget = {
  id: 'w1', kind: 'table', title: 'T',
  query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum', as: 'total' }] },
} as SummaryWidget;

const DIGEST_WIDGET: SummaryWidget = { id: 'w2', kind: 'digest', title: 'D', query: {} } as SummaryWidget;

beforeEach(() => {
  runQuerySpy.mockClear();
  summariseSpy.mockClear();
});

describe('a re-render that is not about data', () => {
  it('does not re-run the query when rowsVersion is unchanged', () => {
    const { rerender } = render(
      <SummaryWidgetContent widget={TABLE_WIDGET} rows={ROWS} rowsVersion={1} />,
    );
    expect(runQuerySpy).toHaveBeenCalledTimes(1);

    // Three more renders, as a drag would cause. Same data, same version.
    rerender(<SummaryWidgetContent widget={TABLE_WIDGET} rows={ROWS} rowsVersion={1} />);
    rerender(<SummaryWidgetContent widget={TABLE_WIDGET} rows={ROWS} rowsVersion={1} />);
    rerender(<SummaryWidgetContent widget={TABLE_WIDGET} rows={ROWS} rowsVersion={1} />);
    expect(runQuerySpy).toHaveBeenCalledTimes(1);
  });

  it('does not re-run the digest when rowsVersion is unchanged', () => {
    const { rerender } = render(
      <SummaryWidgetContent widget={DIGEST_WIDGET} rows={ROWS} rowsVersion={1} />,
    );
    expect(summariseSpy).toHaveBeenCalledTimes(1);
    rerender(<SummaryWidgetContent widget={DIGEST_WIDGET} rows={ROWS} rowsVersion={1} />);
    rerender(<SummaryWidgetContent widget={DIGEST_WIDGET} rows={ROWS} rowsVersion={1} />);
    expect(summariseSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * The row array is mutated in place by the live source, so its identity
   * never changes. A memo keyed on `rows` would therefore go stale forever —
   * the version is what must drive recomputation.
   */
  it('DOES re-run when the version moves, even though the array is the same object', () => {
    const { rerender } = render(
      <SummaryWidgetContent widget={TABLE_WIDGET} rows={ROWS} rowsVersion={1} />,
    );
    expect(runQuerySpy).toHaveBeenCalledTimes(1);
    rerender(<SummaryWidgetContent widget={TABLE_WIDGET} rows={ROWS} rowsVersion={2} />);
    expect(runQuerySpy).toHaveBeenCalledTimes(2);
  });

  it('re-runs when the widget query itself changes', () => {
    const { rerender } = render(
      <SummaryWidgetContent widget={TABLE_WIDGET} rows={ROWS} rowsVersion={1} />,
    );
    const changed = { ...TABLE_WIDGET, query: { columns: ['sector'] } } as SummaryWidget;
    rerender(<SummaryWidgetContent widget={changed} rows={ROWS} rowsVersion={1} />);
    expect(runQuerySpy).toHaveBeenCalledTimes(2);
  });

  it('a text widget never touches the query engine at all', () => {
    const text = { id: 'w3', kind: 'text', title: 'N', text: 'hello', query: {} } as SummaryWidget;
    const { rerender } = render(<SummaryWidgetContent widget={text} rows={ROWS} rowsVersion={1} />);
    rerender(<SummaryWidgetContent widget={text} rows={ROWS} rowsVersion={2} />);
    expect(runQuerySpy).not.toHaveBeenCalled();
    expect(summariseSpy).not.toHaveBeenCalled();
  });
});
