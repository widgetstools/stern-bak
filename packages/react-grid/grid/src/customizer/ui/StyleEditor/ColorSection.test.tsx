import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ColorSection } from './sections/ColorSection';

describe('ColorSection', () => {
  it('renders text and fill CompactColorField controls', () => {
    render(<ColorSection value={{}} onChange={() => {}} inlineBody />);
    expect(screen.getByTestId('style-editor-text-color')).toBeTruthy();
    expect(screen.getByTestId('style-editor-bg-color')).toBeTruthy();
  });

  it('patches text color on commit', () => {
    const onChange = vi.fn();
    render(
      <ColorSection
        value={{ color: '#AABBCC' }}
        onChange={onChange}
        inlineBody
      />,
    );
    const input = screen.getByDisplayValue('#AABBCC');
    fireEvent.change(input, { target: { value: '112233' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ color: '#112233' });
  });

  it('patches fill color and clears background', () => {
    const onChange = vi.fn();
    render(
      <ColorSection
        value={{ backgroundColor: '#AABBCC', backgroundAlpha: 80 }}
        onChange={onChange}
        inlineBody
      />,
    );
    const fill = screen.getByTestId('style-editor-bg-color').querySelector('input')!;
    fireEvent.change(fill, { target: { value: '334455' } });
    fireEvent.blur(fill);
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: '#334455', backgroundAlpha: 80 });

    onChange.mockClear();
    fireEvent.click(screen.getByTestId('style-editor-bg-color').querySelector('[title="Clear color"]')!);
    expect(onChange).toHaveBeenCalledWith({ backgroundColor: undefined, backgroundAlpha: undefined });
  });

  it('clears text color via clear button', () => {
    const onChange = vi.fn();
    render(
      <ColorSection
        value={{ color: '#AABBCC' }}
        onChange={onChange}
        inlineBody
      />,
    );
    fireEvent.click(screen.getByTestId('style-editor-text-color').querySelector('[title="Clear color"]')!);
    expect(onChange).toHaveBeenCalledWith({ color: undefined });
  });

  it('wraps body in Band when not inline', () => {
    render(<ColorSection value={{}} onChange={() => {}} />);
    expect(screen.getByText('COLOUR')).toBeTruthy();
  });
});
