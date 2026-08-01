import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ColorPicker, ColorPickerPopover } from './GridColorPickerPopover';

describe('GridColorPickerPopover', () => {
  it('ColorPicker forwards onChange from FormatColorPicker', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#112233" onChange={onChange} />);
    const input = screen.getAllByDisplayValue('#112233')[0]!;
    fireEvent.change(input, { target: { value: '#445566' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('#445566');
  });

  it('ColorPickerPopover opens popover on trigger click', async () => {
    const onChange = vi.fn();
    render(
      <ColorPickerPopover
        value="#112233"
        onChange={onChange}
        icon={<span data-testid="icon">🎨</span>}
        title="Pick fill"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Pick fill'));
    });
    expect(screen.getAllByDisplayValue('#112233').length).toBeGreaterThan(0);
  });
});
