import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../../hooks/GridProvider';
import { generalSettingsModule } from '../../general-settings';
import { RowGroupingEditor } from './RowGroupingEditor';
import { pickNativeSelect } from '../../../test/selectHelpers';

function wrap(ui: React.ReactNode) {
  const platform = new GridPlatform({
    gridId: 'g',
    modules: [generalSettingsModule],
  });
  return render(<GridProvider platform={platform}>{ui}</GridProvider>);
}

afterEach(() => cleanup());

function commitIconInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('RowGroupingEditor', () => {
  it('enables row group and sets index', () => {
    const onChange = vi.fn();
    wrap(<RowGroupingEditor colId="sector" value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('cols-sector-rg-enable-rowgroup'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enableRowGroup: true }));
  });

  it('selects aggregation function', async () => {
    const onChange = vi.fn();
    wrap(
      <RowGroupingEditor
        colId="qty"
        value={{ enableValue: true }}
        onChange={onChange}
      />,
    );
    await pickNativeSelect('cols-qty-rg-aggfunc', 'Sum');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ aggFunc: 'sum' }));
  });

  it('shows custom expression textarea when aggFunc is custom', async () => {
    const onChange = vi.fn();
    wrap(
      <RowGroupingEditor
        colId="amt"
        value={{ aggFunc: 'custom', customAggExpression: 'SUM([value])' }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('cols-amt-rg-custom-expr'), {
      target: { value: 'AVG([value])' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ customAggExpression: 'AVG([value])' }),
    );
  });

  it('toggles row group on load and group order', () => {
    const onChange = vi.fn();
    wrap(<RowGroupingEditor colId="sector" value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('cols-sector-rg-rowgroup'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rowGroup: true }));

    onChange.mockClear();
    wrap(
      <RowGroupingEditor
        colId="sector"
        value={{ rowGroup: true, rowGroupIndex: 1 }}
        onChange={onChange}
      />,
    );
    commitIconInput(screen.getByTestId('cols-sector-rg-rowgroup-index'), '2');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rowGroupIndex: 2 }));
  });

  it('toggles pivot on load index', () => {
    const onChange = vi.fn();
    wrap(<RowGroupingEditor colId="desk" value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('cols-desk-rg-enable-pivot'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enablePivot: true }));
  });

  it('patches grid-level row grouping settings', async () => {
    wrap(<RowGroupingEditor colId="desk" value={{ pivot: true }} onChange={() => {}} />);
    await pickNativeSelect('cols-desk-rg-grid-groupdisplay', 'groupRows');
    await pickNativeSelect('cols-desk-rg-grid-grouptotal', 'Bottom');
    await pickNativeSelect('cols-desk-rg-grid-grandtotal', 'Pinned top');
    fireEvent.click(screen.getByTestId('cols-desk-rg-grid-suppressaggheader'));
  });

  it('turns row group toggles off and clears group order', () => {
    const onChange = vi.fn();
    wrap(
      <RowGroupingEditor
        colId="sector"
        value={{ enableRowGroup: true, rowGroup: true, rowGroupIndex: 2 }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('cols-sector-rg-enable-rowgroup'));
    expect(onChange).toHaveBeenCalledWith({ rowGroup: true, rowGroupIndex: 2 });

    onChange.mockClear();
    cleanup();
    wrap(
      <RowGroupingEditor
        colId="sector"
        value={{ enableRowGroup: true, rowGroup: true, rowGroupIndex: 2 }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('cols-sector-rg-rowgroup'));
    expect(onChange).toHaveBeenCalledWith({ enableRowGroup: true, rowGroupIndex: 2 });

    onChange.mockClear();
    cleanup();
    wrap(
      <RowGroupingEditor
        colId="sector"
        value={{ rowGroup: true, rowGroupIndex: 2 }}
        onChange={onChange}
      />,
    );
    commitIconInput(screen.getByTestId('cols-sector-rg-rowgroup-index'), '');
    expect(onChange).toHaveBeenCalledWith({ rowGroup: true });
  });

  it('ignores invalid group order and clears aggregation', async () => {
    const onChange = vi.fn();
    wrap(
      <RowGroupingEditor colId="amt" value={{ rowGroup: true, aggFunc: 'sum' }} onChange={onChange} />,
    );
    commitIconInput(screen.getByTestId('cols-amt-rg-rowgroup-index'), 'abc');
    expect(onChange).not.toHaveBeenCalled();

    onChange.mockClear();
    await pickNativeSelect('cols-amt-rg-aggfunc', '— none —');
    expect(onChange).toHaveBeenCalledWith({ rowGroup: true });
  });

  it('clears custom expression and pivot order', async () => {
    const onChange = vi.fn();
    wrap(
      <RowGroupingEditor
        colId="amt"
        value={{ aggFunc: 'custom', customAggExpression: 'SUM([value])', pivot: true, pivotIndex: 1 }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('cols-amt-rg-custom-expr'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ aggFunc: 'custom', pivot: true, pivotIndex: 1 });

    onChange.mockClear();
    commitIconInput(screen.getByTestId('cols-amt-rg-pivot-index'), '3');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ aggFunc: 'custom', pivot: true, pivotIndex: 3 }),
    );

    onChange.mockClear();
    fireEvent.click(screen.getByTestId('cols-amt-rg-pivot'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ aggFunc: 'custom', customAggExpression: 'SUM([value])' }),
    );
  });

  it('turns enable value off and resets grid-level selects', async () => {
    const onChange = vi.fn();
    wrap(
      <RowGroupingEditor colId="desk" value={{ enableValue: true, enablePivot: true }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('cols-desk-rg-enable-value'));
    expect(onChange).toHaveBeenCalledWith({ enablePivot: true });

    await pickNativeSelect('cols-desk-rg-grid-groupdisplay', 'AG-Grid default');
    await pickNativeSelect('cols-desk-rg-grid-grouptotal', 'Off');
    await pickNativeSelect('cols-desk-rg-grid-grandtotal', 'Off');
  });

  it('collapses config to undefined when every toggle is cleared', () => {
    const onChange = vi.fn();
    wrap(
      <RowGroupingEditor colId="sector" value={{ enableRowGroup: true }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('cols-sector-rg-enable-rowgroup'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
