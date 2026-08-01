import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BorderSection } from './sections/BorderSection';

describe('BorderSection', () => {
  it('wraps BorderStyleEditor and forwards border changes', () => {
    const onChange = vi.fn();
    render(<BorderSection value={{}} onChange={onChange} inlineBody />);
    fireEvent.click(screen.getByTestId('ds-be-side-a'));
    expect(onChange).toHaveBeenCalled();
  });

  it('wraps body in Band when not inline', () => {
    render(<BorderSection value={{}} onChange={() => {}} />);
    expect(screen.getByText('BORDER')).toBeTruthy();
  });
});
