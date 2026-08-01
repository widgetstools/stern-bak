import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CustomFormatTab } from './CustomFormatTab';

describe('CustomFormatTab', () => {
  it('commits example format on pick', () => {
    const commitExcel = vi.fn();
    const close = vi.fn();
    render(
      <CustomFormatTab
        value={undefined}
        onChange={() => {}}
        draftExcel=""
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={commitExcel}
        dataType="number"
        close={close}
        testId="cft"
      />,
    );
    const example = screen.getAllByRole('button').find((b) => b.textContent?.includes('#,##0'));
    expect(example).toBeTruthy();
    act(() => {
      fireEvent.click(example!);
    });
    expect(commitExcel).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('applies currency quick insert chip', () => {
    const setDraftExcel = vi.fn();
    render(
      <CustomFormatTab
        value={undefined}
        onChange={() => {}}
        draftExcel="#,##0.00"
        setDraftExcel={setDraftExcel}
        isExcelValid
        commitExcel={() => {}}
        dataType="currency"
        close={() => {}}
        testId="cft"
      />,
    );
    fireEvent.click(screen.getByLabelText('Insert Euro'));
    expect(setDraftExcel).toHaveBeenCalledWith('€#,##0.00');
  });

  it('commits via apply button and clears inline', () => {
    const commitExcel = vi.fn();
    const close = vi.fn();
    const onChange = vi.fn();
    render(
      <CustomFormatTab
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={onChange}
        draftExcel="#,##0.00"
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={commitExcel}
        dataType="number"
        close={close}
        testId="cft"
      />,
    );
    fireEvent.click(screen.getByTestId('cft-apply'));
    expect(commitExcel).toHaveBeenCalledWith('#,##0.00');
    expect(close).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('cft-clear-inline'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('live-updates valid excel draft through IconInput', () => {
    const onChange = vi.fn();
    const setDraftExcel = vi.fn();
    render(
      <CustomFormatTab
        value={undefined}
        onChange={onChange}
        draftExcel=""
        setDraftExcel={setDraftExcel}
        isExcelValid
        commitExcel={() => {}}
        dataType="number"
        close={() => {}}
        testId="cft"
      />,
    );
    fireEvent.change(screen.getByTestId('cft-excel'), { target: { value: '#,##0.00' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'excelFormat', format: '#,##0.00' });
  });

  it('clears committed formatter when excel input emptied', () => {
    const onChange = vi.fn();
    render(
      <CustomFormatTab
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={onChange}
        draftExcel="#,##0.00"
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        dataType="number"
        close={() => {}}
        testId="cft"
      />,
    );
    fireEvent.change(screen.getByTestId('cft-excel'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows invalid state when excel draft is invalid', () => {
    render(
      <CustomFormatTab
        value={undefined}
        onChange={() => {}}
        draftExcel="bad"
        setDraftExcel={() => {}}
        isExcelValid={false}
        commitExcel={() => {}}
        dataType="number"
        close={() => {}}
        testId="cft"
      />,
    );
    expect(screen.getByTestId('cft-apply')).toHaveProperty('disabled', true);
  });

  it('uses date placeholder for datetime columns', () => {
    render(
      <CustomFormatTab
        value={undefined}
        onChange={() => {}}
        draftExcel=""
        setDraftExcel={() => {}}
        isExcelValid
        commitExcel={() => {}}
        dataType="datetime"
        close={() => {}}
        testId="cft"
      />,
    );
    expect(screen.getByPlaceholderText('yyyy-mm-dd')).toBeTruthy();
  });
});
