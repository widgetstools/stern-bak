import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from './radio-group.js';

afterEach(cleanup);

describe('RadioGroup', () => {
  it('selects an option when activated', async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Side" onValueChange={onValueChange}>
        <RadioGroupItem aria-label="Buy" value="buy" />
        <RadioGroupItem aria-label="Sell" value="sell" />
      </RadioGroup>,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Sell' }));

    expect(onValueChange).toHaveBeenCalledWith('sell');
    expect(screen.getByRole('radio', { name: 'Sell' })).toBeChecked();
  });

  it('does not change selection while disabled', async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Side" defaultValue="buy" onValueChange={onValueChange}>
        <RadioGroupItem aria-label="Buy" value="buy" />
        <RadioGroupItem aria-label="Sell" disabled value="sell" />
      </RadioGroup>,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Sell' }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Sell' })).toBeDisabled();
  });

  it('merges className on the group root', () => {
    render(
      <RadioGroup aria-label="Side" className="gap-4">
        <RadioGroupItem aria-label="Buy" value="buy" />
      </RadioGroup>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Side' })).toHaveClass('gap-4');
  });
});
