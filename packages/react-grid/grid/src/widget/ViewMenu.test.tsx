import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewMenu, type ViewMenuProps } from './ViewMenu';

function makeProps(overrides: Partial<ViewMenuProps> = {}): ViewMenuProps {
  return {
    showColumnSelector: true,
    onOpenColumnSelector: vi.fn(),
    showAutoFormat: true,
    showFormattingToolbar: true,
    styleToolbarOpen: false,
    onToggleStyleToolbar: vi.fn(),
    showEditingToolbar: true,
    editingToolbarOpen: false,
    onToggleEditingToolbar: vi.fn(),
    ...overrides,
  };
}

describe('ViewMenu', () => {
  it('renders nothing when every view feature is disabled', () => {
    const { container } = render(
      <ViewMenu
        {...makeProps({
          showColumnSelector: false,
          showAutoFormat: false,
          showFormattingToolbar: false,
          showEditingToolbar: false,
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a single trigger button (toolbar stays uncluttered)', () => {
    render(<ViewMenu {...makeProps()} />);
    expect(screen.getByTestId('toolbar-view-menu-trigger')).toBeInTheDocument();
    // The individual actions are NOT inline on the toolbar.
    expect(screen.queryByTestId('column-selector-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('style-toolbar-toggle')).not.toBeInTheDocument();
  });

  it('opens the menu and routes each action to its handler', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ViewMenu {...props} />);

    await user.click(screen.getByTestId('toolbar-view-menu-trigger'));

    expect(screen.getByTestId('column-selector-open')).toBeInTheDocument();
    expect(screen.getByTestId('auto-format-btn')).toBeInTheDocument();
    expect(screen.getByTestId('style-toolbar-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('editing-toolbar-toggle')).toBeInTheDocument();

    await user.click(screen.getByTestId('column-selector-open'));
    expect(props.onOpenColumnSelector).toHaveBeenCalledTimes(1);
  });

  it('toggles the formatting toolbar and reflects its open state', async () => {
    const user = userEvent.setup();
    const props = makeProps({ styleToolbarOpen: true });
    render(<ViewMenu {...props} />);

    await user.click(screen.getByTestId('toolbar-view-menu-trigger'));
    const item = screen.getByTestId('style-toolbar-toggle');
    expect(item).toHaveAttribute('data-active', 'true');

    await user.click(item);
    expect(props.onToggleStyleToolbar).toHaveBeenCalledTimes(1);
  });

  it('omits disabled items', async () => {
    const user = userEvent.setup();
    render(<ViewMenu {...makeProps({ showAutoFormat: false, showEditingToolbar: false })} />);

    await user.click(screen.getByTestId('toolbar-view-menu-trigger'));
    expect(screen.getByTestId('column-selector-open')).toBeInTheDocument();
    expect(screen.getByTestId('style-toolbar-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('auto-format-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editing-toolbar-toggle')).not.toBeInTheDocument();
  });
});
