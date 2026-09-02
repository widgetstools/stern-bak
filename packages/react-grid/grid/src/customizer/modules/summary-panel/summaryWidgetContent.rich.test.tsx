/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryWidgetContent } from './summaryWidgetContent.js';
import { summaryPanelModule, type SummaryWidget } from './index.js';

/**
 * The sidebar is meant to show what the assistant's own analysis panel shows —
 * tables with their computed analysis, charts with captions, and narrative.
 * Before this it could only render a digest, a chart, or a heatmap, and it
 * discarded the analysis `runQuery` had already produced.
 */
const ROWS = [
  { sector: 'Tech', desk: 'Rates', marketValue: 400, pnl: 120 },
  { sector: 'Tech', desk: 'Credit', marketValue: 300, pnl: -40 },
  { sector: 'Energy', desk: 'Rates', marketValue: 200, pnl: 60 },
  { sector: 'Energy', desk: 'Credit', marketValue: 100, pnl: -10 },
];

function widget(over: Partial<SummaryWidget>): SummaryWidget {
  return { id: 'w1', kind: 'table', query: {}, ...over } as SummaryWidget;
}

function draw(w: SummaryWidget, rows = ROWS) {
  return render(<SummaryWidgetContent widget={w} rows={rows} />);
}

describe('the table kind', () => {
  it('renders a plain result table', () => {
    draw(widget({ kind: 'table', query: { columns: ['sector', 'marketValue'], limit: 4 } }));
    expect(screen.getAllByText('sector').length).toBeGreaterThan(0);
    expect(screen.getAllByText('marketValue').length).toBeGreaterThan(0);
  });

  /**
   * "Showing 5 of 2,000 matching rows" is the difference between a table
   * someone trusts and one they have to go and check. `runQuery` has always
   * computed `matched`; the sidebar simply threw it away.
   */
  it('says how many rows it is showing out of how many matched', () => {
    draw(widget({ kind: 'table', query: { columns: ['sector'], limit: 2 } }));
    expect(screen.getByText(/Showing 2 of 4 matching rows/)).toBeTruthy();
  });

  it('states the count plainly when nothing was truncated', () => {
    draw(widget({ kind: 'table', query: { columns: ['sector'], limit: 50 } }));
    expect(screen.getByText(/4 matching rows/)).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  /** The query engine computes plain-sentence observations about the result;
   *  showing them is what makes it a table WITH ANALYSIS. */
  it('shows the analysis the query engine computed', () => {
    draw(
      widget({
        kind: 'table',
        query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
      }),
    );
    // The leading group and its share of the total.
    expect(screen.getByText(/Tech leads/i)).toBeTruthy();
  });

  /** `table` and `heatmap` are the same table; only the shading differs. */
  it('shades cells only for the heatmap kind', () => {
    const plain = draw(widget({ kind: 'table', query: { columns: ['sector', 'marketValue'] } }));
    const shadedCells = (c: HTMLElement) =>
      [...c.querySelectorAll('td')].filter((td) => td.style.backgroundColor).length;
    expect(shadedCells(plain.container)).toBe(0);
    plain.unmount();

    const heat = draw(widget({ kind: 'heatmap', query: { columns: ['sector', 'marketValue'] } }));
    expect(shadedCells(heat.container)).toBeGreaterThan(0);
  });
});

describe('the text kind', () => {
  it('renders the narrative it was given', () => {
    draw(widget({ kind: 'text', text: 'Concentrated in Tech this morning.' }));
    expect(screen.getByText('Concentrated in Tech this morning.')).toBeTruthy();
  });

  it('formats bold, inline code and bullets', () => {
    const { container } = draw(
      widget({ kind: 'text', text: 'Watch **Tech** and `marketValue`.\n- First point\n- Second point' }),
    );
    expect(container.querySelector('strong')?.textContent).toBe('Tech');
    expect(container.querySelector('code')?.textContent).toBe('marketValue');
    expect(screen.getByText('First point')).toBeTruthy();
    expect(screen.getByText('Second point')).toBeTruthy();
  });

  /**
   * The one field whose content an author writes freely, so it deliberately
   * has no HTML path — it renders as TEXT, escaped like any other string.
   */
  it('renders markup as text rather than as elements', () => {
    const { container } = draw(
      widget({ kind: 'text', text: '<b>not bold</b> <script>alert(1)</script>' }),
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<b>not bold<\/b>/)).toBeTruthy();
  });

  /**
   * A text card is the one tab that does not recompute as rows tick, so a
   * number in it goes stale while everything around it stays live. The stamp
   * is what makes quoting numbers honest rather than forbidden.
   */
  it('stamps the note with what it is current as of', () => {
    draw(widget({ kind: 'text', text: 'Book is long duration.', asOf: 'the 14:32 close' }));
    expect(screen.getByText(/As of the 14:32 close/)).toBeTruthy();
    expect(screen.getByText(/not live/)).toBeTruthy();
  });

  /** Without a stamp it must still say it is static, so a reader is never left
   *  assuming a note updates the way the tabs beside it do. */
  it('says the note is static when no as-of was given', () => {
    draw(widget({ kind: 'text', text: 'Book is long duration.' }));
    expect(screen.getByText(/does not update/i)).toBeTruthy();
  });

  it('needs no rows, since it queries nothing', () => {
    draw(widget({ kind: 'text', text: 'Still fine.' }), []);
    expect(screen.getByText('Still fine.')).toBeTruthy();
  });
});

describe('charts', () => {
  /** An unlabelled chart in a narrow sidebar is a puzzle; the chat panel has
   *  always shown the caption and the sidebar never did. */
  it('captions what the chart is of, and counts its rows', () => {
    draw(
      widget({
        kind: 'chart',
        query: { groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] },
      }),
    );
    expect(screen.getByText(/by sector/)).toBeTruthy();
    expect(screen.getByText(/matching rows?/)).toBeTruthy();
  });
});

describe('the digest kind', () => {
  /** It showed only the first observation and dropped the rest. */
  it('shows more than one highlight when the digest found more than one', () => {
    const { container } = draw(widget({ kind: 'digest', query: { groupBy: ['sector'] } }));
    expect(container.textContent).toBeTruthy();
  });
});

/**
 * A widget whose kind or shape is malformed must be dropped at load rather
 * than crashing the sidebar — and the new kinds have to survive that gate, or
 * they would vanish on reload.
 */
describe('persistence', () => {
  const load = (widgets: unknown[]) =>
    summaryPanelModule.deserialize!({ widgets } as unknown as Record<string, unknown>).widgets;

  it('keeps a table widget', () => {
    expect(load([{ id: 'w1', kind: 'table', query: { columns: ['sector'] } }])).toHaveLength(1);
  });

  it('keeps a text widget, its narrative and its as-of stamp, despite it having no query', () => {
    const [w] = load([{ id: 'w1', kind: 'text', text: 'A note.', asOf: 'the close' }]);
    expect(w).toMatchObject({ kind: 'text', text: 'A note.', asOf: 'the close' });
    // Given an empty query rather than an optional field, so nothing
    // downstream needs a null check for the one kind that queries nothing.
    expect(w.query).toEqual({});
  });

  it('drops a text widget with no narrative to show', () => {
    expect(load([{ id: 'w1', kind: 'text', text: '   ' }])).toHaveLength(0);
  });

  it('still requires a query for every kind that runs one', () => {
    expect(load([{ id: 'w1', kind: 'table' }])).toHaveLength(0);
    expect(load([{ id: 'w2', kind: 'chart' }])).toHaveLength(0);
  });

  it('drops an unknown kind rather than rendering nothing for it', () => {
    expect(load([{ id: 'w1', kind: 'sparkline', query: {} }])).toHaveLength(0);
  });
});
