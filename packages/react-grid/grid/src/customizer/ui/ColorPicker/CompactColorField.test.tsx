import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CompactColorField } from './CompactColorField';

describe('CompactColorField', () => {
  it('commits valid hex on blur', () => {
    const onChange = vi.fn();
    render(
      <CompactColorField value="#AABBCC" onChange={onChange} data-testid="ccf" />,
    );
    const input = screen.getByDisplayValue('#AABBCC');
    fireEvent.change(input, { target: { value: '112233' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('#112233', 100);
  });

  it('calls onClear when hex cleared', () => {
    const onClear = vi.fn();
    render(
      <CompactColorField value="#AABBCC" onChange={() => {}} onClear={onClear} data-testid="ccf" />,
    );
    const input = screen.getByDisplayValue('#AABBCC');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('toggles visibility when handler provided', () => {
    const onToggle = vi.fn();
    render(
      <CompactColorField
        value="#AABBCC"
        onChange={() => {}}
        visible
        onToggleVisible={onToggle}
        data-testid="ccf"
      />,
    );
    fireEvent.click(screen.getByTitle('Hide'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('shows EyeOff when hidden', () => {
    render(
      <CompactColorField
        value="#AABBCC"
        onChange={() => {}}
        visible={false}
        onToggleVisible={() => {}}
        data-testid="ccf"
      />,
    );
    expect(screen.getByTitle('Show')).toBeTruthy();
  });

  it('reverts invalid hex on blur', () => {
    render(
      <CompactColorField value="#AABBCC" onChange={() => {}} data-testid="ccf" />,
    );
    const input = screen.getByDisplayValue('#AABBCC');
    fireEvent.change(input, { target: { value: 'not-hex' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('#AABBCC');
  });

  it('resets draft on Escape', () => {
    render(
      <CompactColorField value="#AABBCC" onChange={() => {}} data-testid="ccf" />,
    );
    const input = screen.getByDisplayValue('#AABBCC');
    fireEvent.change(input, { target: { value: '#112233' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('#AABBCC');
  });

  it('opens popover and adjusts alpha via slider', async () => {
    const onChange = vi.fn();
    render(
      <CompactColorField
        value="#AABBCC"
        alpha={100}
        onChange={onChange}
        data-testid="ccf"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Pick color'));
    });
    const slider = document.querySelector('[role="slider"]');
    expect(slider).toBeTruthy();
    fireEvent.keyDown(slider!, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalled();
  });

  it('picks from recents strip in popover', async () => {
    const onChange = vi.fn();
    render(
      <CompactColorField
        value="#AABBCC"
        onChange={onChange}
        recents={['#112233', '#445566']}
        data-testid="ccf"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Pick color'));
    });
    fireEvent.click(screen.getByTitle('#112233'));
    expect(onChange).toHaveBeenCalledWith('#112233', 100);
  });

  it('clears via minus button when onClear provided', () => {
    const onClear = vi.fn();
    render(
      <CompactColorField
        value="#AABBCC"
        onChange={() => {}}
        onClear={onClear}
        data-testid="ccf"
      />,
    );
    fireEvent.click(screen.getByTitle('Clear color'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('opens popover when wrapper clicked', async () => {
    render(
      <CompactColorField value="#AABBCC" onChange={() => {}} data-testid="ccf" />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ccf'));
    });
    expect(document.querySelector('[role="slider"]')).toBeTruthy();
  });

  it('does not open when disabled', () => {
    render(
      <CompactColorField
        value="#AABBCC"
        onChange={() => {}}
        disabled
        data-testid="ccf"
      />,
    );
    fireEvent.click(screen.getByTestId('ccf'));
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
