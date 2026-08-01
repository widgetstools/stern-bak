import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox.js';

afterEach(cleanup);

describe('Checkbox', () => {
  it('toggles checked state when activated', async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox aria-label="Accept terms" onCheckedChange={onCheckedChange} />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Accept terms' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not toggle while disabled', async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox
        aria-label="Locked"
        disabled
        onCheckedChange={onCheckedChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Locked' }));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('renders the indeterminate indicator state', () => {
    render(
      <Checkbox aria-label="Partial" checked="indeterminate" />,
    );

    expect(screen.getByRole('checkbox', { name: 'Partial' })).toHaveAttribute(
      'data-state',
      'indeterminate',
    );
  });

  it('merges a caller className', () => {
    render(<Checkbox aria-label="Styled" className="border-red-500" />);

    expect(screen.getByRole('checkbox', { name: 'Styled' })).toHaveClass('border-red-500');
  });
});
