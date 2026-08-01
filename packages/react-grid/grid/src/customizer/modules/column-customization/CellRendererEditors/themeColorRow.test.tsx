import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeAwareColorRow } from './themeColorRow';

function commitHex(testId: string, hex: string) {
  const input = screen.getByTestId(testId).querySelector('input')!;
  fireEvent.change(input, { target: { value: hex } });
  fireEvent.blur(input);
}

describe('ThemeAwareColorRow', () => {
  it('sets dark and light slots independently', () => {
    const onChange = vi.fn();
    render(
      <ThemeAwareColorRow
        value={undefined}
        onChange={onChange}
        testIdPrefix="tc"
      />,
    );
    commitHex('tc-dark', '112233');
    expect(onChange).toHaveBeenCalledWith({ dark: '#112233' });
  });

  it('merges light into existing dark value', () => {
    const onChange = vi.fn();
    render(
      <ThemeAwareColorRow
        value={{ dark: '#112233' }}
        onChange={onChange}
        testIdPrefix="tc2"
      />,
    );
    commitHex('tc2-light', 'AABBCC');
    expect(onChange).toHaveBeenCalledWith({ dark: '#112233', light: '#AABBCC' });
  });

  it('clears to undefined when both slots emptied', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ThemeAwareColorRow
        value={{ dark: '#112233', light: '#AABBCC' }}
        onChange={onChange}
        testIdPrefix="tc"
      />,
    );
    const darkInput = screen.getByTestId('tc-dark').querySelector('input')!;
    fireEvent.change(darkInput, { target: { value: '' } });
    fireEvent.blur(darkInput);
    expect(onChange).toHaveBeenCalledWith({ light: '#AABBCC' });

    onChange.mockClear();
    rerender(
      <ThemeAwareColorRow
        value={{ light: '#AABBCC' }}
        onChange={onChange}
        testIdPrefix="tc"
      />,
    );
    const lightInput = screen.getByTestId('tc-light').querySelector('input')!;
    fireEvent.change(lightInput, { target: { value: '' } });
    fireEvent.blur(lightInput);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('uses onClear to drop a slot', () => {
    const onChange = vi.fn();
    render(
      <ThemeAwareColorRow
        value={{ dark: '#112233', light: '#AABBCC' }}
        onChange={onChange}
        testIdPrefix="tc"
      />,
    );
    fireEvent.click(screen.getByTestId('tc-dark').querySelector('[title="Clear color"]')!);
    expect(onChange).toHaveBeenCalledWith({ light: '#AABBCC' });
  });
});
