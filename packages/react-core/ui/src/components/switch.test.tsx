import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch.js';

afterEach(cleanup);

describe('Switch', () => {
  it('toggles checked state when activated', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Live updates" onCheckedChange={onCheckedChange} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Live updates' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch', { name: 'Live updates' })).toBeChecked();
  });

  it('does not toggle while disabled', async () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch aria-label="Locked" disabled onCheckedChange={onCheckedChange} />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Locked' }));

    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Locked' })).toBeDisabled();
  });

  it('merges a caller className', () => {
    render(<Switch aria-label="Styled" className="scale-110" />);

    expect(screen.getByRole('switch', { name: 'Styled' })).toHaveClass('scale-110');
  });
});
