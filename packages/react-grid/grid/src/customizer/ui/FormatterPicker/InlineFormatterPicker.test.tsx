import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InlineFormatterPicker } from './InlineFormatterPicker';
import { presetsForDataType } from './presetsForDataType';

describe('InlineFormatterPicker', () => {
  const presets = presetsForDataType('number');

  it('renders collapsed by default and expands on chevron click', () => {
    render(
      <InlineFormatterPicker
        value={undefined}
        onChange={() => {}}
        presets={presets}
        activePreset={undefined}
        preview=""
        draftExcel=""
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={() => {}}
        dataType="number"
        defaultCollapsed
        testId="ifp"
      />,
    );
    expect(screen.getByTestId('ifp-collapsed')).toBeTruthy();
    fireEvent.click(screen.getByTestId('ifp-collapsed'));
    expect(screen.getByTestId('ifp-preset')).toBeTruthy();
  });

  it('calls pickPreset when preset chosen from dropdown', async () => {
    const pickPreset = vi.fn();
    render(
      <InlineFormatterPicker
        value={undefined}
        onChange={() => {}}
        presets={presets}
        activePreset={undefined}
        preview="1,234.57"
        draftExcel=""
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={pickPreset}
        dataType="number"
        defaultCollapsed={false}
        testId="ifp"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ifp-preset'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/2 decimals/i));
    });
    expect(pickPreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'num-2dp' }),
    );
  });

  it('clears committed excel format when input emptied', () => {
    const onChange = vi.fn();
    const setDraftExcel = vi.fn();
    render(
      <InlineFormatterPicker
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={onChange}
        presets={presets}
        activePreset={undefined}
        preview="1,234.57"
        draftExcel="#,##0.00"
        setDraftExcel={setDraftExcel}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={() => {}}
        dataType="number"
        defaultCollapsed={false}
        testId="ifp"
      />,
    );
    fireEvent.change(screen.getByTestId('ifp-excel'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('renders vertical layout preset and excel rows', async () => {
    const pickPreset = vi.fn();
    render(
      <InlineFormatterPicker
        value={undefined}
        onChange={() => {}}
        presets={presets}
        activePreset={undefined}
        preview=""
        draftExcel=""
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={pickPreset}
        dataType="date"
        defaultCollapsed={false}
        layout="vertical"
        testId="vfp"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('vfp-preset'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/2 decimals/i));
    });
    expect(pickPreset).toHaveBeenCalled();
    expect(screen.getByTestId('vfp-excel')).toBeTruthy();
  });

  it('shows preview chip when expanded with a formatted value', () => {
    render(
      <InlineFormatterPicker
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={() => {}}
        presets={presets}
        activePreset={presets.find((p) => p.id === 'num-2dp')}
        preview="1,234.57"
        draftExcel="#,##0.00"
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={() => {}}
        dataType="number"
        defaultCollapsed={false}
        testId="ifp"
      />,
    );
    expect(screen.getByText('PREVIEW')).toBeTruthy();
    expect(screen.getByText('1,234.57')).toBeTruthy();
  });

  it('collapses expanded picker from chevron', () => {
    render(
      <InlineFormatterPicker
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={() => {}}
        presets={presets}
        activePreset={undefined}
        preview=""
        draftExcel="#,##0.00"
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={() => {}}
        dataType="number"
        defaultCollapsed={false}
        testId="ifp"
      />,
    );
    fireEvent.click(screen.getByTitle('Collapse'));
    expect(screen.getByTestId('ifp-collapsed')).toBeTruthy();
  });

  it('live-updates excel format while typing in horizontal layout', () => {
    const onChange = vi.fn();
    const setDraftExcel = vi.fn();
    render(
      <InlineFormatterPicker
        value={undefined}
        onChange={onChange}
        presets={presets}
        activePreset={presets.find((p) => p.id === 'num-2dp')}
        preview=""
        draftExcel=""
        setDraftExcel={setDraftExcel}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={() => {}}
        dataType="number"
        defaultCollapsed={false}
        testId="ifp"
      />,
    );
    fireEvent.change(screen.getByTestId('ifp-excel'), { target: { value: '#,##0.00' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'excelFormat', format: '#,##0.00' });
  });

  it('shows collapsed trigger caption for tick templates', () => {
    render(
      <InlineFormatterPicker
        value={{ kind: 'tick', tick: 'TICK32' }}
        onChange={() => {}}
        presets={presets}
        activePreset={presets.find((p) => p.id === 'tick-32')}
        preview="101-16"
        draftExcel=""
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={() => {}}
        dataType="number"
        defaultCollapsed
        testId="ifp"
      />,
    );
    expect(screen.getByTestId('ifp-collapsed')).toBeTruthy();
  });

  it('renders vertical preset labels without hints', () => {
    const presetsNoHint = presets.map((p) => ({ ...p, hint: undefined }));
    render(
      <InlineFormatterPicker
        value={undefined}
        onChange={() => {}}
        presets={presetsNoHint}
        activePreset={undefined}
        preview=""
        draftExcel=""
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        pickPreset={() => {}}
        dataType="date"
        defaultCollapsed={false}
        layout="vertical"
        testId="vfp"
      />,
    );
    expect(screen.getByTestId('vfp-preset')).toBeTruthy();
  });

  it('clears excel in vertical layout and picks from reference popover', async () => {
    const onChange = vi.fn();
    const setDraftExcel = vi.fn();
    const commitExcel = vi.fn();
    render(
      <InlineFormatterPicker
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={onChange}
        presets={presets}
        activePreset={undefined}
        preview=""
        draftExcel="#,##0.00"
        setDraftExcel={setDraftExcel}
        isExcelValid
        commitExcel={commitExcel}
        pickPreset={() => {}}
        dataType="datetime"
        defaultCollapsed={false}
        layout="vertical"
        testId="vfp"
      />,
    );
    fireEvent.change(screen.getByTestId('vfp-excel'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);

    await act(async () => {
      fireEvent.click(screen.getByTestId('vfp-info'));
    });
    const example = await screen.findByText(/2 decimals/i);
    await act(async () => {
      fireEvent.click(example.closest('button')!);
    });
    expect(setDraftExcel).toHaveBeenCalled();
    expect(commitExcel).toHaveBeenCalled();
  });
});
