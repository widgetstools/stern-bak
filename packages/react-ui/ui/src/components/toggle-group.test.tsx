import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleGroup, ToggleGroupItem } from './toggle-group.js';

afterEach(cleanup);

describe('ToggleGroup', () => {
  it('selects one item in single mode', async () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup aria-label="Alignment" onValueChange={onValueChange} type="single">
        <ToggleGroupItem aria-label="Left" value="left">
          L
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Right" value="right">
          R
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Right' }));

    expect(onValueChange).toHaveBeenCalledWith('right');
    expect(screen.getByRole('radio', { name: 'Right' })).toHaveAttribute('data-state', 'on');
  });

  it('does not select a disabled item', async () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup aria-label="Alignment" onValueChange={onValueChange} type="single" value="left">
        <ToggleGroupItem aria-label="Left" value="left">
          L
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Right" disabled value="right">
          R
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Right' }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Right' })).toBeDisabled();
  });

  it('applies outline variant classes from the group context', () => {
    render(
      <ToggleGroup aria-label="Style" type="single" variant="outline">
        <ToggleGroupItem aria-label="One" value="one">
          1
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'One' }).className).toContain('border');
  });
});
