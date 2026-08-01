import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Slider } from './slider.js';

afterEach(cleanup);

describe('Slider', () => {
  it('updates value when a thumb is moved with the keyboard', async () => {
    const onValueChange = vi.fn();
    render(
      <Slider aria-label="Opacity" defaultValue={[25]} max={100} onValueChange={onValueChange} />,
    );

    const control = screen.getByLabelText('Opacity');
    within(control).getByRole('slider').focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalled();
  });

  it('does not respond while disabled', async () => {
    const onValueChange = vi.fn();
    render(
      <Slider
        aria-label="Locked"
        defaultValue={[25]}
        disabled
        max={100}
        onValueChange={onValueChange}
      />,
    );

    const control = screen.getByLabelText('Locked');
    within(control).getByRole('slider').focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onValueChange).not.toHaveBeenCalled();
    expect(control).toHaveAttribute('aria-disabled', 'true');
  });

  it('merges a caller className on the root', () => {
    render(<Slider aria-label="Styled" className="max-w-xs" defaultValue={[10]} max={100} />);

    expect(screen.getByLabelText('Styled')).toHaveClass('max-w-xs');
  });
});
