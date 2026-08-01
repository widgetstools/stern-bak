import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select.js';

afterEach(cleanup);

describe('Select', () => {
  it('opens the listbox and selects an option', async () => {
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="Side">
          <SelectValue placeholder="Pick a side" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="buy">Buy</SelectItem>
          <SelectItem value="sell">Sell</SelectItem>
        </SelectContent>
      </Select>,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Side' }));
    await userEvent.click(screen.getByRole('option', { name: 'Sell' }));

    expect(onValueChange).toHaveBeenCalledWith('sell');
    expect(screen.getByRole('combobox', { name: 'Side' })).toHaveTextContent('Sell');
  });

  it('does not select a disabled option', async () => {
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="Side">
          <SelectValue placeholder="Pick a side" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem disabled value="buy">
            Buy
          </SelectItem>
        </SelectContent>
      </Select>,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Side' }));

    expect(screen.getByRole('option', { name: 'Buy' })).toHaveAttribute('data-disabled');
  });

  it('merges className on the trigger', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Styled" className="max-w-xs">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole('combobox', { name: 'Styled' })).toHaveClass('max-w-xs');
  });
});
