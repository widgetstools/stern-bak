import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FormatColorPicker } from './FormatColorPicker';

describe('FormatColorPicker', () => {
  it('renders hex input with current value', () => {
    render(<FormatColorPicker value="#FF0000" onChange={() => {}} />);
    expect(screen.getAllByDisplayValue('#FF0000').length).toBeGreaterThan(0);
  });

  it('calls onChange when hex edited and committed', () => {
    const onChange = vi.fn();
    render(<FormatColorPicker value="#000000" onChange={onChange} />);
    const input = screen.getAllByDisplayValue('#000000')[0]!;
    fireEvent.change(input, { target: { value: '#112233' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('#112233');
  });

  it('clears hex when clear clicked', () => {
    const onChange = vi.fn();
    render(
      <FormatColorPicker
        value="#AABBCC"
        onChange={onChange}
        allowClear
      />,
    );
    fireEvent.click(screen.getByTitle('Clear color'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('selects preset swatch and calls onCommit', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const { container } = render(
      <FormatColorPicker value="#000000" onChange={onChange} onCommit={onCommit} />,
    );
    const presetButtons = container.querySelectorAll('.grid.grid-cols-8 button');
    fireEvent.click(presetButtons[0]!);
    expect(onChange).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalled();
  });

  it('commits valid hex on Enter', () => {
    const onCommit = vi.fn();
    render(
      <FormatColorPicker value="#000000" onChange={() => {}} onCommit={onCommit} />,
    );
    const input = screen.getAllByDisplayValue('#000000')[0]!;
    fireEvent.change(input, { target: { value: '#AABBCC' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalled();
  });

  it('updates color from SV pad pointer drag', () => {
    const onChange = vi.fn();
    const { container } = render(
      <FormatColorPicker value="#FF0000" onChange={onChange} />,
    );
    const pad = container.querySelector('[style*="crosshair"]') as HTMLElement;
    fireEvent.pointerDown(pad, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
  });

  it('updates color from hue strip drag', () => {
    const onChange = vi.fn();
    const { container } = render(
      <FormatColorPicker value="#FF0000" onChange={onChange} />,
    );
    const hue = container.querySelector('[style*="linear-gradient(to right"]') as HTMLElement;
    expect(hue).toBeTruthy();
    fireEvent.pointerDown(hue, { clientX: 10, clientY: 5, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 5, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(onChange).toHaveBeenCalled();
  });

  it('ignores invalid hex while typing', () => {
    const onChange = vi.fn();
    render(<FormatColorPicker value="#000000" onChange={onChange} />);
    const input = screen.getAllByDisplayValue('#000000')[0]!;
    fireEvent.change(input, { target: { value: '#GGGGGG' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects from recent swatches and calls onCommit', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const { container } = render(
      <FormatColorPicker value="#000000" onChange={onChange} onCommit={onCommit} />,
    );
    const presetButtons = container.querySelectorAll('.grid.grid-cols-8 button');
    fireEvent.click(presetButtons[0]!);
    onChange.mockClear();
    onCommit.mockClear();

    expect(screen.getByText('Recent')).toBeInTheDocument();
    const recentRow = screen.getByText('Recent').parentElement!;
    fireEvent.click(recentRow.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith('#0f172a');
    expect(onCommit).toHaveBeenCalled();
  });

  it('tolerates corrupt recent-colors storage', () => {
    localStorage.setItem('ds-recent-colors', 'not-json');
    render(<FormatColorPicker value="#000000" onChange={() => {}} />);
    localStorage.removeItem('ds-recent-colors');
    expect(screen.getAllByDisplayValue('#000000').length).toBeGreaterThan(0);
  });

  it('omits clear button when allowClear is false', () => {
    render(<FormatColorPicker value="#AABBCC" onChange={() => {}} allowClear={false} />);
    expect(screen.queryByTitle('Clear color')).toBeNull();
  });
});
