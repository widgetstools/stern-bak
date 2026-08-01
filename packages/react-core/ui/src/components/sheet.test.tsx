import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet.js';

afterEach(cleanup);

describe('Sheet', () => {
  it('opens in a portal and exposes title and description', async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button type="button">Open panel</button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine the current view.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open panel' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('Refine the current view.')).toBeInTheDocument();
  });

  it('renders distinct classes for left and right sides', () => {
    const { rerender } = render(
      <Sheet defaultOpen>
        <SheetContent side="right">
          <SheetTitle>Right</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const rightClass = screen.getByRole('dialog').className;

    rerender(
      <Sheet defaultOpen>
        <SheetContent side="left">
          <SheetTitle>Left</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const leftClass = screen.getByRole('dialog').className;

    expect(rightClass).not.toBe(leftClass);
  });

  it('merges className on sheet content', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent className="max-w-lg">
          <SheetTitle>Wide</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-lg');
  });

  it('renders header and footer layout regions', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetHeader data-testid="header">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Refine the current view.</SheetDescription>
          </SheetHeader>
          <SheetFooter data-testid="footer">
            <button type="button">Apply</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByTestId('header')).toHaveClass('flex-col');
    expect(screen.getByTestId('footer')).toHaveClass('flex-col-reverse');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('renders distinct classes for top and bottom sides', () => {
    const { rerender } = render(
      <Sheet defaultOpen>
        <SheetContent side="top">
          <SheetTitle>Top</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const topClass = screen.getByRole('dialog').className;

    rerender(
      <Sheet defaultOpen>
        <SheetContent side="bottom">
          <SheetTitle>Bottom</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const bottomClass = screen.getByRole('dialog').className;

    expect(topClass).not.toBe(bottomClass);
    expect(topClass).toMatch(/top-0/);
    expect(bottomClass).toMatch(/bottom-0/);
  });
});
