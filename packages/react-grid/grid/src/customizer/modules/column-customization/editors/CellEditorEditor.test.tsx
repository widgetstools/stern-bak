import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AppDataLookup } from '@wellsfargo-starui/engine';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../../hooks/GridProvider';
import { CellEditorEditor, parseValuesSource } from './CellEditorEditor';
import { pickNativeSelect } from '../../../test/selectHelpers';

function wrap(ui: React.ReactNode, appData?: AppDataLookup) {
  const platform = new GridPlatform({ gridId: 'g', modules: [], appData });
  return render(<GridProvider platform={platform}>{ui}</GridProvider>);
}

const mockAppData: AppDataLookup = {
  listProviders: () => ['orders', 'quotes'],
  keysOf: (name) =>
    name === 'orders' ? ['sides', 'status'] : name === 'quotes' ? ['bid'] : [],
  subscribe: (fn) => {
    fn();
    return () => {};
  },
};

describe('parseValuesSource', () => {
  it('parses {{provider.key}} bindings', () => {
    expect(parseValuesSource('{{orders.sides}}')).toEqual({
      providerName: 'orders',
      key: 'sides',
    });
    expect(parseValuesSource('{{orders.}}')).toEqual({
      providerName: 'orders',
      key: undefined,
    });
  });

  it('returns empty parts for invalid strings', () => {
    expect(parseValuesSource(undefined)).toEqual({
      providerName: undefined,
      key: undefined,
    });
    expect(parseValuesSource('not-a-binding')).toEqual({
      providerName: undefined,
      key: undefined,
    });
  });
});

describe('CellEditorEditor', () => {
  afterEach(() => cleanup());

  it('selects editor kind and shows kind-specific controls', async () => {
    const onChange = vi.fn();
    wrap(<CellEditorEditor colId="note" value={undefined} onChange={onChange} />);
    await pickNativeSelect('cols-note-celleditor-kind', 'Number');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agNumberCellEditor' }),
    );
  });

  it('updates numeric min/max when number editor selected', () => {
    const onChange = vi.fn();
    wrap(
      <CellEditorEditor
        colId="qty"
        value={{ kind: 'agNumberCellEditor' }}
        onChange={onChange}
      />,
    );
    const min = screen.getByTestId('cols-qty-celleditor-num-min');
    fireEvent.change(min, { target: { value: '0' } });
    fireEvent.keyDown(min, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ min: 0 }) }),
    );
  });

  it('clears editor kind back to none', async () => {
    const onChange = vi.fn();
    wrap(
      <CellEditorEditor
        colId="note"
        value={{ kind: 'agTextCellEditor' }}
        onChange={onChange}
      />,
    );
    await pickNativeSelect('cols-note-celleditor-kind', 'None');
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('authors select editor static values', async () => {
    const onChange = vi.fn();
    wrap(<CellEditorEditor colId="status" value={undefined} onChange={onChange} />);
    await pickNativeSelect('cols-status-celleditor-kind', 'Select');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agSelectCellEditor' }),
    );

    onChange.mockClear();
    wrap(
      <CellEditorEditor
        colId="status"
        value={{ kind: 'agSelectCellEditor', values: ['A'] }}
        onChange={onChange}
      />,
    );
    const values = screen.getByTestId('cols-status-celleditor-static-values');
    fireEvent.change(values, { target: { value: 'A,B,C' } });
    fireEvent.keyDown(values, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ values: ['A', 'B', 'C'] }),
    );
  });

  it('switches away from select editor and drops values', async () => {
    const onChange = vi.fn();
    wrap(
      <CellEditorEditor
        colId="status"
        value={{ kind: 'agSelectCellEditor', values: ['A'] }}
        onChange={onChange}
      />,
    );
    await pickNativeSelect('cols-status-celleditor-kind', 'Number');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agNumberCellEditor' }),
    );
    expect(onChange.mock.calls[0]![0]).not.toHaveProperty('values');
  });

  it('authors text and large-text editor params', async () => {
    const onChange = vi.fn();
    wrap(<CellEditorEditor colId="note" value={undefined} onChange={onChange} />);
    await pickNativeSelect('cols-note-celleditor-kind', 'Large text');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agLargeTextCellEditor' }),
    );

    onChange.mockClear();
    wrap(
      <CellEditorEditor
        colId="title"
        value={{ kind: 'agTextCellEditor', params: { maxLength: 10 } }}
        onChange={onChange}
      />,
    );
    const maxLen = screen.getByTestId('cols-title-celleditor-text-maxlength');
    fireEvent.change(maxLen, { target: { value: '20' } });
    fireEvent.keyDown(maxLen, { key: 'Enter' });
    expect(onChange).toHaveBeenCalled();
  });

  it('switches select value source to app data mode', async () => {
    const onChange = vi.fn();
    wrap(
      <CellEditorEditor
        colId="sym"
        value={{ kind: 'agSelectCellEditor', values: ['A'] }}
        onChange={onChange}
      />,
    );
    await pickNativeSelect('cols-sym-celleditor-value-source', 'App data source');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ values: undefined }));
  });

  it('authors app data provider and key pickers when lookup is available', async () => {
    const onChange = vi.fn();
    wrap(
      <CellEditorEditor
        colId="sym"
        value={{ kind: 'agSelectCellEditor', valuesSource: '{{orders.sides}}' }}
        onChange={onChange}
      />,
      mockAppData,
    );
    await pickNativeSelect('cols-sym-celleditor-source-provider', 'quotes');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ valuesSource: '{{quotes.}}' }),
    );

    onChange.mockClear();
    cleanup();
    wrap(
      <CellEditorEditor
        colId="sym"
        value={{ kind: 'agSelectCellEditor', valuesSource: '{{orders.}}' }}
        onChange={onChange}
      />,
      mockAppData,
    );
    await pickNativeSelect('cols-sym-celleditor-source-key', 'status');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ valuesSource: '{{orders.status}}' }),
    );
  });

  it('falls back to free-text binding when app data is unavailable', async () => {
    const onChange = vi.fn();
    wrap(
      <CellEditorEditor
        colId="sym"
        value={{ kind: 'agSelectCellEditor', valuesSource: '{{x.y}}' }}
        onChange={onChange}
      />,
    );
    const binding = screen.getByTestId('cols-sym-celleditor-source-text');
    fireEvent.change(binding, { target: { value: '{{orders.sides}}' } });
    fireEvent.keyDown(binding, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ valuesSource: '{{orders.sides}}' }),
    );
  });

  it('authors number and large-text param fields', async () => {
    const onChange = vi.fn();
    wrap(
      <CellEditorEditor
        colId="qty"
        value={{ kind: 'agNumberCellEditor', params: { min: 0 } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('cols-qty-celleditor-num-max'), {
      target: { value: '100' },
    });
    fireEvent.keyDown(screen.getByTestId('cols-qty-celleditor-num-max'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ max: 100 }) }),
    );

    onChange.mockClear();
    wrap(
      <CellEditorEditor
        colId="note"
        value={{ kind: 'agLargeTextCellEditor', params: { rows: 4 } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('cols-note-celleditor-lt-cols'), {
      target: { value: '80' },
    });
    fireEvent.keyDown(screen.getByTestId('cols-note-celleditor-lt-cols'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalled();
  });

  it('selects date and checkbox editor kinds', async () => {
    const onChange = vi.fn();
    wrap(<CellEditorEditor colId="when" value={undefined} onChange={onChange} />);
    await pickNativeSelect('cols-when-celleditor-kind', 'Date');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agDateCellEditor' }),
    );

    onChange.mockClear();
    wrap(<CellEditorEditor colId="flag" value={undefined} onChange={onChange} />);
    await pickNativeSelect('cols-flag-celleditor-kind', 'Checkbox');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agCheckboxCellEditor' }),
    );
  });
});
