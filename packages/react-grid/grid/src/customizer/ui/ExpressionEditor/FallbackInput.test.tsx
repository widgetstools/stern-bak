import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FallbackInput } from './FallbackInput';

describe('FallbackInput', () => {
  it('commits on blur when value changed', () => {
    const onCommit = vi.fn();
    render(
      <FallbackInput value="a" onCommit={onCommit} data-testid="fb" />,
    );
    const input = screen.getByTestId('fb') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'b' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('b');
  });

  it('commits on Enter for single-line input', () => {
    const onCommit = vi.fn();
    render(
      <FallbackInput value="" onCommit={onCommit} data-testid="fb" />,
    );
    const input = screen.getByTestId('fb');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('x');
  });

  it('exposes imperative handle focus/getValue', () => {
    let handle: { focus: () => void; getValue: () => string } | null = null;
    render(
      <FallbackInput
        value="expr"
        onCommit={() => {}}
        handleRef={(h) => { handle = h; }}
        data-testid="fb"
      />,
    );
    expect(handle?.getValue()).toBe('expr');
    handle?.focus();
    expect(document.activeElement).toBe(screen.getByTestId('fb'));
  });

  it('syncs external value changes', () => {
    const { rerender } = render(
      <FallbackInput value="one" onCommit={() => {}} data-testid="fb" />,
    );
    rerender(<FallbackInput value="two" onCommit={() => {}} data-testid="fb" />);
    expect((screen.getByTestId('fb') as HTMLInputElement).value).toBe('two');
  });

  it('does not commit when value unchanged on blur', () => {
    const onCommit = vi.fn();
    render(
      <FallbackInput value="same" onCommit={onCommit} data-testid="fb" />,
    );
    fireEvent.blur(screen.getByTestId('fb'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('calls onChange while typing', () => {
    const onChange = vi.fn();
    render(
      <FallbackInput value="" onCommit={() => {}} onChange={onChange} data-testid="fb" />,
    );
    fireEvent.change(screen.getByTestId('fb'), { target: { value: 'draft' } });
    expect(onChange).toHaveBeenCalledWith('draft');
  });

  it('commits multiline on Ctrl+Enter', () => {
    const onCommit = vi.fn();
    render(
      <FallbackInput value="" onCommit={onCommit} multiline data-testid="fb" />,
    );
    fireEvent.change(screen.getByTestId('fb'), { target: { value: 'line1\nline2' } });
    fireEvent.keyDown(screen.getByTestId('fb'), { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith('line1\nline2');
  });

  it('supports object handleRef and clears on unmount', () => {
    const handleRef = { current: null as { focus: () => void; getValue: () => string } | null };
    const { unmount } = render(
      <FallbackInput value="keep" onCommit={() => {}} handleRef={handleRef} data-testid="fb" />,
    );
    expect(handleRef.current?.getValue()).toBe('keep');
    unmount();
    expect(handleRef.current).toBeNull();
  });

  it('respects readOnly', () => {
    render(
      <FallbackInput value="locked" onCommit={() => {}} readOnly data-testid="fb" />,
    );
    expect(screen.getByTestId('fb')).toHaveProperty('readOnly', true);
  });
});
