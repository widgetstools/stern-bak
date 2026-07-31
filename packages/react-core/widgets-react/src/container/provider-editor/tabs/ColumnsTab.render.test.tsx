/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColumnsTab } from './ColumnsTab.js';

let lastGridProps: any;

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => {
    lastGridProps = props;
    return <div data-testid="columns-grid" data-rows={props.rowData?.length ?? 0} />;
  },
}));

vi.mock('@wellsfargo-starui/grid/customizer', () => ({
  ExpressionEditor: () => null,
}));

vi.mock('../../../theme/useAgGridTheme.js', () => ({
  useAgGridTheme: () => ({ theme: null }),
}));

vi.mock('../ensureProviderEditorAgGridModules.js', () => ({
  ensureProviderEditorAgGridModules: vi.fn(),
}));

vi.mock('../MultiSelect.js', () => ({
  MultiSelect: ({ onChange, value }: { onChange: (v: string[]) => void; value: string[] }) => (
    <button type="button" onClick={() => onChange([...value, 'symbol'])}>pick-key</button>
  ),
}));

vi.mock('../columnDefsIo.js', () => ({
  exportColumnDefs: vi.fn(),
  parseColumnDefsImport: vi.fn(() => [{ field: 'imported', headerName: 'Imported', cellDataType: 'text' }]),
}));

import { exportColumnDefs, parseColumnDefsImport } from '../columnDefsIo.js';

const columns = [
  { field: 'positionId', headerName: 'Position Id', cellDataType: 'text' as const },
  { field: 'symbol', headerName: 'Symbol', cellDataType: 'text' as const },
];

afterEach(() => {
  cleanup();
});

describe('ColumnsTab — rendering', () => {
  it('renders the grid with column rows and key picker', () => {
    render(
      <ColumnsTab
        columns={columns}
        onChange={vi.fn()}
        keyColumn="positionId"
        onKeyColumnChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('columns-grid')).toHaveAttribute('data-rows', '2');
    expect(screen.getByRole('button', { name: 'pick-key' })).toBeInTheDocument();
  });

  it('commits key column changes from MultiSelect', async () => {
    const user = userEvent.setup();
    const onKeyColumnChange = vi.fn();
    render(
      <ColumnsTab
        columns={columns}
        onChange={vi.fn()}
        keyColumn={undefined}
        onKeyColumnChange={onKeyColumnChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'pick-key' }));
    expect(onKeyColumnChange).toHaveBeenCalledWith(['symbol']);
  });

  it('exports column definitions and supports empty-state import', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColumnsTab columns={[]} onChange={onChange} keyColumn={undefined} onKeyColumnChange={vi.fn()} />);
    await user.click(screen.getByTestId('columns-tab-import-empty'));
    expect(screen.getByTestId('columns-tab-import-empty')).toBeInTheDocument();
    render(
      <ColumnsTab columns={columns} onChange={vi.fn()} keyColumn="positionId" onKeyColumnChange={vi.fn()} />,
    );
    await user.click(screen.getByTestId('columns-tab-export'));
    expect(exportColumnDefs).toHaveBeenCalledWith(columns);
  });

  it('adds a manual column and clears all after confirmation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ColumnsTab columns={columns} onChange={onChange} keyColumn="positionId" onKeyColumnChange={vi.fn()} />,
    );
    await user.type(screen.getByPlaceholderText('e.g., trade_id'), 'qty');
    await user.click(screen.getByTitle('Add column'));
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ field: 'qty' })]),
    );
    await user.click(screen.getByTestId('columns-tab-clear-all'));
    await user.click(await screen.findByRole('button', { name: /^Clear all$/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('imports column JSON from a file', async () => {
    const onChange = vi.fn();
    render(
      <ColumnsTab columns={[]} onChange={onChange} keyColumn={undefined} onKeyColumnChange={vi.fn()} />,
    );
    const input = screen.getByTestId('columns-tab-import-input');
    const file = new File(['[]'], 'cols.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('updates a cell value through the grid callback', () => {
    const onChange = vi.fn();
    render(
      <ColumnsTab columns={columns} onChange={onChange} keyColumn="positionId" onKeyColumnChange={vi.fn()} />,
    );
    lastGridProps.onCellValueChanged({
      data: { ...columns[0], _rowId: 'positionId-0' },
      colDef: { field: 'headerName' },
      newValue: 'Renamed',
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ field: 'positionId', headerName: 'Renamed' })]),
    );
  });

  it('surfaces import parse failures', async () => {
    vi.mocked(parseColumnDefsImport).mockImplementationOnce(() => {
      throw new Error('bad json');
    });
    render(
      <ColumnsTab columns={[]} onChange={vi.fn()} keyColumn={undefined} onKeyColumnChange={vi.fn()} />,
    );
    const input = screen.getByTestId('columns-tab-import-input');
    fireEvent.change(input, { target: { files: [new File(['x'], 'bad.json', { type: 'application/json' })] } });
    await waitFor(() =>
      expect(screen.getByTestId('columns-tab-import-error')).toHaveTextContent('bad json'),
    );
  });

  it('reorders and deletes columns from grid callbacks', () => {
    const onChange = vi.fn();
    render(
      <ColumnsTab columns={columns} onChange={onChange} keyColumn="positionId" onKeyColumnChange={vi.fn()} />,
    );
    lastGridProps.onRowDragEnd({
      api: {
        forEachNode: (fn: (n: { data: typeof columns[0] & { _rowId: string } }) => void) => {
          fn({ data: { ...columns[1]!, _rowId: 'symbol-1' } });
          fn({ data: { ...columns[0]!, _rowId: 'positionId-0' } });
        },
      },
    });
    expect(onChange).toHaveBeenCalledWith([columns[1], columns[0]]);
    const deleteCol = lastGridProps.columnDefs.at(-1);
    deleteCol.onCellClicked({ data: columns[0] });
    expect(onChange).toHaveBeenCalledWith([columns[1]]);
  });
});
