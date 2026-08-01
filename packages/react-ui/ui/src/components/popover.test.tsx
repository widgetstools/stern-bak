import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';

afterEach(cleanup);

describe('Popover', () => {
  it('opens content when the trigger is activated', async () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button type="button">Filter rows</button>
        </PopoverTrigger>
        <PopoverContent>Choose a column filter.</PopoverContent>
      </Popover>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Filter rows' }));

    expect(screen.getByText('Choose a column filter.')).toBeVisible();
    expect(screen.getByText('Choose a column filter.').closest('[data-state="open"]')).toBeTruthy();
  });

  it('merges className on popover content', async () => {
    render(
      <Popover defaultOpen>
        <PopoverContent className="w-96">Open panel</PopoverContent>
      </Popover>,
    );

    expect(screen.getByText('Open panel')).toHaveClass('w-96');
  });
});
