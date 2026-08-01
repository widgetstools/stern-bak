import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card.js';

afterEach(cleanup);

describe('HoverCard', () => {
  it('opens content when the trigger is hovered', async () => {
    render(
      <HoverCard openDelay={0} closeDelay={0}>
        <HoverCardTrigger asChild>
          <button type="button">AAPL</button>
        </HoverCardTrigger>
        <HoverCardContent>Apple Inc.</HoverCardContent>
      </HoverCard>,
    );

    await userEvent.hover(screen.getByRole('button', { name: 'AAPL' }));

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeVisible();
      expect(screen.getByText('Apple Inc.').closest('[data-state="open"]')).toBeTruthy();
    });
  });

  it('merges className on hover card content', () => {
    render(
      <HoverCard open>
        <HoverCardContent className="w-80">Details</HoverCardContent>
      </HoverCard>,
    );

    expect(screen.getByText('Details')).toHaveClass('w-80');
  });
});
