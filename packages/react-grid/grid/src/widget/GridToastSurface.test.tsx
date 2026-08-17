/**
 * @vitest-environment jsdom
 *
 * The two properties that make this mountable from inside the grid rather than
 * left to the app: exactly one toaster per document however many grids are on
 * screen, and a theme that follows `data-theme` rather than the OS.
 *
 * The real `sonner` toaster is not rendered here — it is a portal full of
 * animation timers, and what needs pinning is which instance decides to render
 * one, not what sonner does afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('@wellsfargo-starui/react', () => ({
  SonnerToaster: (props: { theme?: string }) => (
    <div data-testid="toaster" data-theme-prop={props.theme} />
  ),
}));

const { GridToastSurface, resetGridToastSurfaceRegistry } = await import(
  './GridToastSurface.js'
);

beforeEach(() => {
  resetGridToastSurfaceRegistry();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  resetGridToastSurfaceRegistry();
});

describe('GridToastSurface', () => {
  it('mounts a toaster', async () => {
    render(<GridToastSurface />);
    await waitFor(() => expect(screen.getByTestId('toaster')).toBeInTheDocument());
  });

  it('mounts exactly ONE toaster for three grids in the same document', async () => {
    render(
      <>
        <GridToastSurface />
        <GridToastSurface />
        <GridToastSurface />
      </>,
    );
    // Sonner keeps its queue in module state and every mounted toaster renders
    // all of it, so a second one here would show every toast twice.
    await waitFor(() => expect(screen.getAllByTestId('toaster')).toHaveLength(1));
  });

  it('hands the surface to a surviving grid when the owner unmounts', async () => {
    function Pair({ showFirst }: { showFirst: boolean }) {
      return (
        <>
          {showFirst && <GridToastSurface />}
          <GridToastSurface />
        </>
      );
    }
    const { rerender } = render(<Pair showFirst />);
    await waitFor(() => expect(screen.getAllByTestId('toaster')).toHaveLength(1));

    rerender(<Pair showFirst={false} />);
    // Still exactly one — the second instance takes over rather than the
    // document being left with no surface at all.
    await waitFor(() => expect(screen.getAllByTestId('toaster')).toHaveLength(1));
  });

  it('takes its theme from data-theme on <html>, not from the OS', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<GridToastSurface />);
    await waitFor(() =>
      expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme-prop', 'light'),
    );
  });

  it('defaults to dark when nothing has set data-theme', async () => {
    render(<GridToastSurface />);
    await waitFor(() =>
      expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme-prop', 'dark'),
    );
  });

  it('follows a live theme flip', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<GridToastSurface />);
    await waitFor(() =>
      expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme-prop', 'dark'),
    );

    document.documentElement.setAttribute('data-theme', 'light');
    await waitFor(() =>
      expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme-prop', 'light'),
    );
  });
});
