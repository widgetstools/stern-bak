import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TextSection } from './sections/TextSection';

describe('TextSection', () => {
  it('toggles bold via toolbar button', () => {
    const onChange = vi.fn();
    render(<TextSection value={{}} onChange={onChange} inlineBody />);
    fireEvent.click(screen.getByTitle('Bold'));
    expect(onChange).toHaveBeenCalledWith({ bold: true });
  });

  it('clears bold when toggled off', () => {
    const onChange = vi.fn();
    render(<TextSection value={{ bold: true }} onChange={onChange} inlineBody />);
    fireEvent.click(screen.getByTitle('Bold'));
    expect(onChange).toHaveBeenCalledWith({ bold: false });
  });

  it('toggles italic underline and strikethrough', () => {
    const onChange = vi.fn();
    render(<TextSection value={{}} onChange={onChange} inlineBody />);
    fireEvent.click(screen.getByTitle('Italic'));
    expect(onChange).toHaveBeenCalledWith({ italic: true });
    onChange.mockClear();
    fireEvent.click(screen.getByTitle('Underline'));
    expect(onChange).toHaveBeenCalledWith({ underline: true });
    onChange.mockClear();
    fireEvent.click(screen.getByTitle('Strikethrough'));
    expect(onChange).toHaveBeenCalledWith({ strikethrough: true });
  });

  it('sets alignment from align buttons', () => {
    const onChange = vi.fn();
    render(<TextSection value={{}} onChange={onChange} inlineBody />);
    fireEvent.click(screen.getByTitle('Center'));
    expect(onChange).toHaveBeenCalledWith({ align: 'center' });
  });

  it('clears align when same button clicked again', () => {
    const onChange = vi.fn();
    render(<TextSection value={{ align: 'right' }} onChange={onChange} inlineBody />);
    fireEvent.click(screen.getByTitle('Align right'));
    expect(onChange).toHaveBeenCalledWith({ align: undefined });
  });

  it('sets justify alignment', () => {
    const onChange = vi.fn();
    render(<TextSection value={{}} onChange={onChange} inlineBody />);
    fireEvent.click(screen.getByTitle('Justify'));
    expect(onChange).toHaveBeenCalledWith({ align: 'justify' });
  });

  it('updates font size and weight via steppers', () => {
    const onChange = vi.fn();
    render(<TextSection value={{ fontSize: 13, fontWeight: 600 }} onChange={onChange} inlineBody />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '16' } });
    expect(onChange).toHaveBeenCalledWith({ fontSize: 16 });
    onChange.mockClear();
    fireEvent.change(inputs[1]!, { target: { value: '700' } });
    expect(onChange).toHaveBeenCalledWith({ fontWeight: 700 });
  });

  it('wraps body in Band when not inline', () => {
    render(<TextSection value={{}} onChange={() => {}} />);
    expect(screen.getByText('TYPE')).toBeTruthy();
  });

  it('clears toggles and alignment when clicked again', () => {
    const onChange = vi.fn();
    render(
      <TextSection
        value={{ italic: true, align: 'center', bold: true }}
        onChange={onChange}
        inlineBody
      />,
    );
    fireEvent.click(screen.getByTitle('Italic'));
    expect(onChange).toHaveBeenCalledWith({ italic: false });
    onChange.mockClear();
    fireEvent.click(screen.getByTitle('Center'));
    expect(onChange).toHaveBeenCalledWith({ align: undefined });
    onChange.mockClear();
    fireEvent.click(screen.getByTitle('Align left'));
    expect(onChange).toHaveBeenCalledWith({ align: 'left' });
  });

  it('clears font size and weight when steppers emptied', () => {
    const onChange = vi.fn();
    render(
      <TextSection value={{ fontSize: 13, fontWeight: 600 }} onChange={onChange} inlineBody />,
    );
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ fontSize: undefined });
    onChange.mockClear();
    fireEvent.change(inputs[1]!, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ fontWeight: undefined });
  });

  it('rejects invalid font size and weight values', () => {
    const onChange = vi.fn();
    render(<TextSection value={{}} onChange={onChange} inlineBody />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '-1' } });
    expect(onChange).toHaveBeenCalledWith({ fontSize: undefined });
    onChange.mockClear();
    fireEvent.change(inputs[1]!, { target: { value: '999' } });
    expect(onChange).toHaveBeenCalledWith({ fontWeight: undefined });
  });
});
