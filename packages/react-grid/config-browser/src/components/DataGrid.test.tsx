import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataGrid } from './DataGrid';

/**
 * jsdom lays everything out at zero, and AG Grid virtualises columns off the
 * measured viewport width — without this only the first column renders and
 * every cell assertion below silently passes on an empty grid.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1400 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 });
});

afterEach(cleanup);

function cells() {
  return Object.fromEntries(
    [...document.querySelectorAll('.ag-cell')].map((c) => [c.getAttribute('col-id'), c as HTMLElement]),
  );
}

function renderGrid(props: Partial<React.ComponentProps<typeof DataGrid>> = {}) {
  const onRowClick = vi.fn();
  render(
    <DataGrid
      rows={[{ configId: 'grid-1', appId: 'trading', payload: { columns: 3 }, note: null }]}
      theme="dark"
      quickFilter=""
      primaryKey="configId"
      onRowClick={onRowClick}
      {...props}
    />,
  );
  return { onRowClick };
}

/**
 * The grid derives its columns from whatever shape the selected Dexie table
 * happens to have, so the interesting behaviour is all in the derivation:
 * where the primary key lands, and how a multi-hundred-KB payload column is
 * rendered without stringifying the whole thing (see previewJson.test.ts for
 * the budget itself).
 */
describe('DataGrid', () => {
  it('derives a column per key of the first row', async () => {
    renderGrid();

    await waitFor(() => expect(screen.getByText('grid-1')).toBeTruthy());
    expect(Object.keys(cells())).toEqual(['configId', 'appId', 'payload', 'note']);
  });

  it('hoists the primary key to the first column wherever it sits in the row', async () => {
    renderGrid({
      rows: [{ appId: 'trading', label: 'Ops', roleId: 'r-1' }],
      primaryKey: 'roleId',
    });

    await waitFor(() => expect(screen.getByText('r-1')).toBeTruthy());
    // Key order in a Dexie row is insertion order, not schema order — the pk
    // has to be pulled to the front explicitly or it lands wherever.
    expect(Object.keys(cells())[0]).toBe('roleId');
  });

  it('pins and mono-styles the primary key column', async () => {
    renderGrid();

    await waitFor(() => expect(screen.getByText('grid-1')).toBeTruthy());
    const pk = cells().configId;
    expect(pk.style.fontFamily).toBe('var(--ds-font-mono)');
    expect(pk.style.fontWeight).toBe('600');
    expect(document.querySelector('.ag-pinned-left-cols-container')?.contains(pk)).toBe(true);
  });

  it('renders an object cell as a budgeted JSON preview, not the full payload', async () => {
    renderGrid({
      rows: [{ configId: 'grid-1', payload: { columns: 3, filler: 'x'.repeat(500) } }],
    });

    await waitFor(() => expect(screen.getByText('grid-1')).toBeTruthy());
    const payload = cells().payload;
    expect(payload.textContent?.startsWith('{"columns":3,"filler":"xxx')).toBe(true);
    expect(payload.textContent?.endsWith('…')).toBe(true);
    // The cell must never grow with the payload — that was the open/scroll cost.
    expect(payload.textContent!.length).toBeLessThan(100);
    expect(payload.style.fontFamily).toBe('var(--ds-font-mono)');
    expect(payload.style.color).toBe('var(--de-text-secondary)');
  });

  it('renders a null cell as empty and visibly ghosted', async () => {
    renderGrid();

    await waitFor(() => expect(screen.getByText('grid-1')).toBeTruthy());
    const note = cells().note;
    expect(note.textContent).toBe('');
    expect(note.style.color).toBe('var(--de-text-ghost)');
    expect(note.style.fontStyle).toBe('italic');
  });

  it('leaves a plain string cell unstyled', async () => {
    renderGrid();

    await waitFor(() => expect(screen.getByText('trading')).toBeTruthy());
    expect(cells().appId.getAttribute('style')).not.toContain('font-family');
  });

  it('renders a boolean as AG Grid\'s read-only checkbox, not the formatter\'s text', async () => {
    // Pinning real behaviour: the valueFormatter returns "true"/"false" but
    // AG Grid 35 substitutes its own checkbox cell for boolean values, so the
    // formatter's boolean branch never reaches the DOM.
    renderGrid({ rows: [{ configId: 'grid-1', enabled: true }] });

    await waitFor(() => expect(screen.getByText('grid-1')).toBeTruthy());
    const checkbox = cells().enabled.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.getAttribute('aria-label')).toBe('checked');
    expect(cells().enabled.textContent).not.toContain('true');
  });

  it('hands the clicked row\'s data back to the caller', async () => {
    const row = { configId: 'grid-1', appId: 'trading' };
    const { onRowClick } = renderGrid({ rows: [row] });

    await waitFor(() => expect(screen.getByText('grid-1')).toBeTruthy());
    await userEvent.click(screen.getByText('grid-1'));

    // The drawer edits whatever object arrives here — a shallow copy would
    // silently break the delete-by-pk path.
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0]).toEqual(row);
  });

  it('filters rows against the toolbar quick filter', async () => {
    const rows = [
      { configId: 'grid-1', appId: 'trading' },
      { configId: 'grid-2', appId: 'research' },
    ];
    const { rerender } = render(
      <DataGrid rows={rows} theme="dark" quickFilter="" primaryKey="configId" onRowClick={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByText('grid-2')).toBeTruthy());

    rerender(
      <DataGrid rows={rows} theme="dark" quickFilter="research" primaryKey="configId" onRowClick={vi.fn()} />,
    );

    await waitFor(() => expect(screen.queryByText('grid-1')).toBeNull());
    expect(screen.getByText('grid-2')).toBeTruthy();
  });

  it('matches the quick filter against an object cell\'s preview text', async () => {
    const rows = [
      { configId: 'grid-1', payload: { widget: 'blotter' } },
      { configId: 'grid-2', payload: { widget: 'chart' } },
    ];
    const { rerender } = render(
      <DataGrid rows={rows} theme="dark" quickFilter="" primaryKey="configId" onRowClick={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('grid-2')).toBeTruthy());

    rerender(
      <DataGrid rows={rows} theme="dark" quickFilter="blotter" primaryKey="configId" onRowClick={vi.fn()} />,
    );

    // getQuickFilterText also runs on the budgeted preview — a term past the
    // 200-char budget is intentionally unmatchable.
    await waitFor(() => expect(screen.queryByText('grid-2')).toBeNull());
    expect(screen.getByText('grid-1')).toBeTruthy();
  });

  it('renders no columns for an empty table', async () => {
    renderGrid({ rows: [] });

    await waitFor(() => expect(document.querySelector('.ag-header-cell')).toBeNull());
    expect(Object.keys(cells())).toEqual([]);
  });

  it('re-skins without remounting when the theme flips', async () => {
    const rows = [{ configId: 'grid-1' }];
    const { rerender } = render(
      <DataGrid rows={rows} theme="dark" quickFilter="" primaryKey="configId" onRowClick={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('grid-1')).toBeTruthy());

    rerender(
      <DataGrid rows={rows} theme="light" quickFilter="" primaryKey="configId" onRowClick={vi.fn()} />,
    );

    expect(screen.getByText('grid-1')).toBeTruthy();
  });
});
