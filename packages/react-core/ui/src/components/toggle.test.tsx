import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from './toggle.js';

afterEach(cleanup);

describe('Toggle', () => {
  it('toggles pressed state when activated', async () => {
    const onPressedChange = vi.fn();
    render(
      <Toggle aria-label="Bold" onPressedChange={onPressedChange}>
        B
      </Toggle>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Bold' }));

    expect(onPressedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('data-state', 'on');
  });

  it('does not toggle while disabled', async () => {
    const onPressedChange = vi.fn();
    render(
      <Toggle aria-label="Locked" disabled onPressedChange={onPressedChange}>
        B
      </Toggle>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Locked' }));

    expect(onPressedChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Locked' })).toBeDisabled();
  });

  it('renders distinct classes for outline and default variants', () => {
    const { rerender } = render(
      <Toggle aria-label="Default" variant="default">
        A
      </Toggle>,
    );
    const def = screen.getByRole('button', { name: 'Default' }).className;

    rerender(
      <Toggle aria-label="Outline" variant="outline">
        B
      </Toggle>,
    );
    const outline = screen.getByRole('button', { name: 'Outline' }).className;

    expect(def).not.toBe(outline);
  });
});
