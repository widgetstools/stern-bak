import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScrollArea, ScrollBar } from './scroll-area.js';

afterEach(cleanup);

describe('ScrollArea', () => {
  it('renders scrollable content inside the viewport', () => {
    render(
      <ScrollArea className="h-48 w-48">
        <p>Scrollable body</p>
      </ScrollArea>,
    );

    expect(screen.getByText('Scrollable body')).toBeInTheDocument();
  });

  it('merges className on the root', () => {
    render(
      <ScrollArea className="rounded-lg">
        <p>Body</p>
      </ScrollArea>,
    );

    expect(screen.getByText('Body').closest('[data-radix-scroll-area-viewport]')?.parentElement).toHaveClass(
      'rounded-lg',
    );
  });

  it('renders a horizontal scrollbar variant', () => {
    render(
      <ScrollArea>
        <ScrollBar orientation="horizontal" />
        <p>Wide content</p>
      </ScrollArea>,
    );

    expect(screen.getByText('Wide content')).toBeInTheDocument();
  });
});
