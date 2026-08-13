/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDataFields } from './AppDataFields.js';

let lastGridProps: any;

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => {
    lastGridProps = props;
    return <div data-testid="ag-grid-stub" data-rows={props.rowData?.length ?? 0} />;
  },
}));

vi.mock('../../../theme/useAgGridTheme.js', () => ({
  useAgGridTheme: () => ({ theme: null }),
}));

vi.mock('../ensureProviderEditorAgGridModules.js', () => ({
  ensureProviderEditorAgGridModules: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe('AppDataFields', () => {
  it('adds a variable via the form', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppDataFields
        cfg={{ providerType: 'appdata', variables: {} }}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByPlaceholderText('e.g., asOfDate'), 'asOfDate');
    await user.type(screen.getByPlaceholderText('value'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: /Add/i }));
    expect(onChange).toHaveBeenCalledWith({
      variables: {
        asOfDate: {
          key: 'asOfDate',
          value: '2026-01-01',
          type: 'string',
        },
      },
    });
  });

  it('shows duplicate key warning and disables add', async () => {
    const user = userEvent.setup();
    render(
      <AppDataFields
        cfg={{
          providerType: 'appdata',
          variables: {
            foo: { key: 'foo', value: '1', type: 'string' },
          },
        }}
        onChange={vi.fn()}
      />,
    );
    await user.type(screen.getByPlaceholderText('e.g., asOfDate'), 'foo');
    expect(screen.getByText('Key already exists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add/i })).toBeDisabled();
  });

  it('updates and deletes variables through grid callbacks', () => {
    const onChange = vi.fn();
    render(
      <AppDataFields
        cfg={{
          providerType: 'appdata',
          variables: {
            a: { key: 'a', value: '1', type: 'string' },
          },
        }}
        onChange={onChange}
      />,
    );
    lastGridProps.onCellValueChanged({
      data: { key: 'a', value: '1', _rowId: 'a-0' },
      colDef: { field: 'value' },
      newValue: '2',
    });
    expect(onChange).toHaveBeenCalled();
    const deleteCol = lastGridProps.columnDefs.find((c: any) => c.onCellClicked);
    deleteCol.onCellClicked({ data: { _rowId: 'a-0', key: 'a' } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ignores add when key or value is blank and strips legacy editing keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppDataFields
        cfg={{
          providerType: 'appdata',
          variables: {
            '__editing_tmp': { key: '__editing_tmp', value: 'x', type: 'string' },
            keep: { key: 'keep', value: '1', type: 'string' },
          },
        }}
        onChange={onChange}
      />,
    );
    expect(screen.queryByText('__editing_tmp')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('normalizes date cell edits to ISO strings', () => {
    const onChange = vi.fn();
    render(
      <AppDataFields
        cfg={{
          providerType: 'appdata',
          variables: {
            d: { key: 'd', value: '2026-01-01', type: 'date' },
          },
        }}
        onChange={onChange}
      />,
    );
    lastGridProps.onCellValueChanged({
      data: { key: 'd', value: '2026-01-01', type: 'date', _rowId: 'd-0' },
      colDef: { field: 'value' },
      newValue: new Date('2026-02-01T12:00:00Z'),
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          d: expect.objectContaining({ value: '2026-02-01' }),
        }),
      }),
    );
  });
});
