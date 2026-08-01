import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FormatSection } from './sections/FormatSection';

describe('FormatSection', () => {
  it('selects preset toggles for number columns', () => {
    const onChange = vi.fn();
    render(
      <FormatSection
        value={{}}
        onChange={onChange}
        dataType="number"
        inlineBody
      />,
    );
    fireEvent.click(screen.getByTitle('currency'));
    expect(onChange).toHaveBeenCalledWith({
      valueFormatter: { kind: 'preset', preset: 'currency' },
    });
  });

  it('commits excel format via IconInput', () => {
    const onChange = vi.fn();
    render(
      <FormatSection value={{}} onChange={onChange} inlineBody />,
    );
    const input = screen.getByTestId('style-editor-excel-format');
    fireEvent.change(input, { target: { value: '#,##0.00' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({
      valueFormatter: { kind: 'excelFormat', format: '#,##0.00' },
    });
  });

  it('wraps body in Band when not inline', () => {
    render(<FormatSection value={{}} onChange={() => {}} dataType="number" />);
    expect(screen.getByText('FORMAT')).toBeTruthy();
  });

  it('clears formatter preset toggle when clicked again', () => {
    const onChange = vi.fn();
    render(
      <FormatSection
        value={{ valueFormatter: { kind: 'preset', preset: 'currency' } }}
        onChange={onChange}
        dataType="number"
        inlineBody
      />,
    );
    fireEvent.click(screen.getByTitle('currency'));
    expect(onChange).toHaveBeenCalledWith({ valueFormatter: undefined });
  });
});
