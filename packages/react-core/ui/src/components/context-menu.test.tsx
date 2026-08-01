import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './context-menu.js';

afterEach(cleanup);

describe('ContextMenu', () => {
  it('opens on context menu and activates an item', async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button type="button">Row</button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onSelect}>Copy</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Row' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not activate a disabled menu item', async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu open>
        <ContextMenuTrigger asChild>
          <button type="button">Row</button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled onSelect={onSelect}>
            Locked
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    await userEvent.click(screen.getByRole('menuitem', { name: 'Locked' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('merges className on menu content', () => {
    render(
      <ContextMenu open>
        <ContextMenuContent className="min-w-48">
          <ContextMenuItem>One</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByRole('menu')).toHaveClass('min-w-48');
  });

  it('renders checkbox item with checked state', async () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuCheckboxItem checked>Checked</ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem>Unchecked</ContextMenuCheckboxItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const items = screen.getAllByRole('menuitemcheckbox');
    expect(items).toHaveLength(2);
  });

  it('renders radio item', async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuRadioItem onSelect={onSelect} value="a">
            Option A
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="b">Option B</ContextMenuRadioItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(2);
  });

  it('renders label', () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuLabel>Label</ContextMenuLabel>
          <ContextMenuItem>Item</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  it('renders separator', () => {
    const { container } = render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuItem>Item 1</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Item 2</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
  });

  it('renders shortcut', () => {
    const { container } = render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuItem>
            Copy
            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByText('⌘C')).toBeInTheDocument();
  });

  it('renders inset menu item', () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuItem inset>Indented Item</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const item = screen.getByRole('menuitem', { name: 'Indented Item' });
    expect(item).toHaveClass('pl-8');
  });

  it('renders inset label', () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuLabel inset>Section</ContextMenuLabel>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const label = screen.getByText('Section');
    expect(label).toHaveClass('pl-8');
  });

  it('merges custom className on item', () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuItem className="custom-class">Item</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByRole('menuitem', { name: 'Item' })).toHaveClass('custom-class');
  });

  it('merges custom className on checkbox item', () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuCheckboxItem className="custom-class">
            Checkbox
          </ContextMenuCheckboxItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByRole('menuitemcheckbox')).toHaveClass('custom-class');
  });

  it('renders submenu with sub trigger', async () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Submenu</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Sub Item</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByText('Submenu')).toBeInTheDocument();
  });

  it('renders sub trigger with inset', () => {
    render(
      <ContextMenu open>
        <ContextMenuContent>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>Indented Sub</ContextMenuSubTrigger>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const trigger = screen.getByText('Indented Sub').closest('[role="menuitem"]');
    expect(trigger).toHaveClass('pl-8');
  });
});
