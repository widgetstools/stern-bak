import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsibleToolbar } from './CollapsibleToolbar.js';

afterEach(cleanup);

function renderToolbar(overrides: Partial<React.ComponentProps<typeof CollapsibleToolbar>> = {}) {
  const onCollapsedChange = vi.fn();
  const onPinnedChange = vi.fn();
  const props = {
    isCollapsed: true,
    isPinned: false,
    onCollapsedChange,
    onPinnedChange,
    children: <span>Toolbar actions</span>,
    ...overrides,
  };
  const view = render(<CollapsibleToolbar {...props} />);
  return { ...view, onCollapsedChange, onPinnedChange };
}

describe('CollapsibleToolbar', () => {
  it('keeps toolbar content expanded while pinned', () => {
    renderToolbar({ isPinned: true });

    expect(screen.getByText('Toolbar actions')).toBeInTheDocument();
  });

  it('requests expand on mouse enter when unpinned', () => {
    const { container, onCollapsedChange } = renderToolbar();

    fireEvent.mouseEnter(container.firstElementChild!);

    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('requests collapse on mouse leave when unpinned', () => {
    const { container, onCollapsedChange } = renderToolbar();

    fireEvent.mouseLeave(container.firstElementChild!);

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('does not toggle collapse callbacks while pinned', () => {
    const { container, onCollapsedChange } = renderToolbar({ isPinned: true });

    fireEvent.mouseEnter(container.firstElementChild!);
    fireEvent.mouseLeave(container.firstElementChild!);

    expect(onCollapsedChange).not.toHaveBeenCalled();
  });

  it('pins open and expands when the pin control is activated', async () => {
    const { container, onPinnedChange, onCollapsedChange } = renderToolbar();

    fireEvent.mouseEnter(container.firstElementChild!);
    // Pin button is icon-only — no accessible name (see WORKLOG a11y item).
    await userEvent.click(screen.getByRole('button'));

    expect(onPinnedChange).toHaveBeenCalledWith(true);
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('unpins without collapsing while the pointer is still over the toolbar', async () => {
    const { onPinnedChange, onCollapsedChange } = renderToolbar({
      isPinned: true,
    });
    onCollapsedChange.mockClear();

    await userEvent.click(screen.getByRole('button'));

    expect(onPinnedChange).toHaveBeenCalledWith(false);
    // Clicking the pin control leaves the pointer inside the toolbar, so hover
    // keeps the panel expanded until mouse leave.
    expect(onCollapsedChange).not.toHaveBeenCalled();
  });

  it('applies the selected color palette class on the pill handle', () => {
    const { container } = renderToolbar({ color: 'green' });

    expect(container.querySelector('.bg-green-500\\/40')).not.toBeNull();
  });

  it('merges a caller className on the wrapper', () => {
    const { container } = renderToolbar({ className: 'mt-4' });

    expect(container.firstElementChild).toHaveClass('mt-4');
  });
});
