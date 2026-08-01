import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/core';
import { FormatterPicker } from './FormatterPicker';

function open(testId = 'fp') {
  act(() => {
    fireEvent.click(screen.getByTestId(`${testId}-trigger`));
  });
}

describe('CompactFormatterPicker — tabbed selector', () => {
  it('renders one tab per category fitting the data type, plus Custom', () => {
    render(<FormatterPicker compact dataType="number" value={undefined} onChange={() => {}} data-testid="fp" />);
    open();
    for (const c of ['number', 'negatives', 'conditional', 'tick', 'percent', 'custom']) {
      expect(screen.getByTestId(`fp-tab-${c}`)).toBeTruthy();
    }
    // Date/time + Boolean don't fit a number column.
    expect(screen.queryByTestId('fp-tab-date')).toBeNull();
    expect(screen.queryByTestId('fp-tab-boolean')).toBeNull();
  });

  it('applies a preset and closes the popover on pick', async () => {
    const onChange = vi.fn();
    render(<FormatterPicker compact dataType="number" value={undefined} onChange={onChange} data-testid="fp" />);
    open();
    act(() => {
      fireEvent.click(screen.getByTestId('fp-preset-num-2dp'));
    });
    expect(onChange).toHaveBeenCalledWith<[ValueFormatterTemplate]>({ kind: 'excelFormat', format: '#,##0.00' });
    // Popover content carries data-testid="fp" — it should unmount on pick.
    await waitFor(() => expect(screen.queryByTestId('fp')).toBeNull());
  });

  it('shows the Excel reference INLINE in the Custom tab — no nested popover', () => {
    render(<FormatterPicker compact dataType="number" value={undefined} onChange={() => {}} data-testid="fp" />);
    open();
    act(() => {
      fireEvent.click(screen.getByTestId('fp-tab-custom'));
    });
    expect(screen.getByTestId('fp-custom')).toBeTruthy();
    // Reference examples render directly, not behind a second popover trigger.
    expect(screen.getByTestId('fp-reference')).toBeTruthy();
    expect(screen.getByTestId('fp-excel')).toBeTruthy();
  });

  it('search flattens the tabs into a matching result list', () => {
    render(<FormatterPicker compact dataType="number" value={undefined} onChange={() => {}} data-testid="fp" />);
    open();
    act(() => {
      fireEvent.change(screen.getByTestId('fp-search'), { target: { value: 'paren' } });
    });
    expect(screen.getByTestId('fp-results')).toBeTruthy();
    expect(screen.getByTestId('fp-preset-num-neg-parens')).toBeTruthy();
    // The category rail is replaced by the flat results while searching.
    expect(screen.queryByTestId('fp-tab-number')).toBeNull();
  });

  it('shows Text transforms (camelCase etc.) for string columns', () => {
    render(<FormatterPicker compact dataType="string" value={undefined} onChange={() => {}} data-testid="fp" />);
    open();
    expect(screen.getByTestId('fp-tab-text')).toBeTruthy();
    expect(screen.getByTestId('fp-preset-str-camel')).toBeTruthy();
    expect(screen.getByTestId('fp-preset-str-upper')).toBeTruthy();
  });

  it('clears formatter from compact clear button', async () => {
    const onChange = vi.fn();
    render(
      <FormatterPicker
        compact
        dataType="number"
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={onChange}
        data-testid="fp"
      />,
    );
    open();
    act(() => {
      fireEvent.click(screen.getByTestId('fp-clear'));
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows empty search message when nothing matches', () => {
    render(<FormatterPicker compact dataType="number" value={undefined} onChange={() => {}} data-testid="fp" />);
    open();
    act(() => {
      fireEvent.change(screen.getByTestId('fp-search'), { target: { value: 'zzzznotfound' } });
    });
    expect(screen.getByText(/No formats match/)).toBeTruthy();
  });

  it('switches category tab to tick presets', () => {
    render(<FormatterPicker compact dataType="number" value={undefined} onChange={() => {}} data-testid="fp" />);
    open();
    act(() => {
      fireEvent.click(screen.getByTestId('fp-tab-tick'));
    });
    const tickPreset = screen.getByTestId('fp-preset-tick-32');
    fireEvent.mouseEnter(tickPreset);
    fireEvent.mouseLeave(tickPreset);
    expect(tickPreset).toBeTruthy();
  });

  it('clears inline excel when input emptied', () => {
    const onChange = vi.fn();
    render(
      <FormatterPicker
        dataType="number"
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={onChange}
        data-testid="ifp"
      />,
    );
    fireEvent.change(screen.getByTestId('ifp-excel'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('uses explicit sampleValue prop', () => {
    render(
      <FormatterPicker
        compact
        dataType="number"
        value={{ kind: 'excelFormat', format: '#,##0' }}
        onChange={() => {}}
        sampleValue={9999}
        data-testid="fp"
      />,
    );
    open();
    expect(screen.getByTestId('fp')).toBeTruthy();
  });
});

describe('FormatterPicker — non-compact inline mode', () => {
  it('renders expanded inline picker by default', () => {
    render(
      <FormatterPicker dataType="number" value={undefined} onChange={() => {}} data-testid="ifp" />,
    );
    expect(screen.getByTestId('ifp')).toBeTruthy();
    expect(screen.getByTestId('ifp-preset')).toBeTruthy();
    expect(screen.getByTestId('ifp-excel')).toBeTruthy();
  });

  it('collapses and expands inline picker', () => {
    render(
      <FormatterPicker
        dataType="number"
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={() => {}}
        defaultCollapsed
        data-testid="ifp"
      />,
    );
    expect(screen.getByTestId('ifp-collapsed')).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByTestId('ifp-collapsed'));
    });
    expect(screen.getByTestId('ifp')).toBeTruthy();
  });

  it('commits excel format from inline input', () => {
    const onChange = vi.fn();
    render(
      <FormatterPicker
        dataType="number"
        value={undefined}
        onChange={onChange}
        data-testid="ifp"
      />,
    );
    const input = screen.getByTestId('ifp-excel');
    fireEvent.change(input, { target: { value: '#,##0.00' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ kind: 'excelFormat', format: '#,##0.00' });
  });

  it('renders vertical layout without preview chip', () => {
    render(
      <FormatterPicker
        dataType="number"
        value={{ kind: 'excelFormat', format: '#,##0.00' }}
        onChange={() => {}}
        layout="vertical"
        data-testid="vfp"
      />,
    );
    expect(screen.getByTestId('vfp')).toBeTruthy();
    expect(screen.queryByText('PREVIEW')).toBeNull();
  });
});
