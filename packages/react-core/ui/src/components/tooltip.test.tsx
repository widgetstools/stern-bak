import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip.js';

afterEach(cleanup);

describe('Tooltip', () => {
  it('opens content when the trigger is hovered', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button">Help</button>
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await userEvent.hover(screen.getByRole('button', { name: 'Help' }));

    await waitFor(() => {
      expect(screen.getByRole('tooltip', { name: 'Keyboard shortcuts' })).toBeVisible();
    });
  });

  it('merges className on tooltip content', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <button type="button">Help</button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">Hint</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByRole('tooltip', { name: 'Hint' })).toHaveClass('max-w-xs');
  });
});
