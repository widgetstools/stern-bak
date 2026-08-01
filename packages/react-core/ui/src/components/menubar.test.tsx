import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from './menubar.js';

afterEach(cleanup);

describe('Menubar', () => {
  it('opens a menu and activates an item', async () => {
    const onSelect = vi.fn();
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onSelect={onSelect}>New</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    await userEvent.click(screen.getByRole('menuitem', { name: 'File' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'New' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not activate a disabled menu item', async () => {
    const onSelect = vi.fn();
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled onSelect={onSelect}>
              Locked
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    await userEvent.click(screen.getByRole('menuitem', { name: 'Locked' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('merges className on the menubar root', () => {
    render(
      <Menubar className="border-primary">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(screen.getByRole('menubar')).toHaveClass('border-primary');
  });

  it('renders checkbox item', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem checked>Checked</MenubarCheckboxItem>
            <MenubarCheckboxItem>Unchecked</MenubarCheckboxItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    const items = screen.getAllByRole('menuitemcheckbox');
    expect(items).toHaveLength(2);
  });

  it('renders radio item', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarRadioItem value="a">Option A</MenubarRadioItem>
            <MenubarRadioItem value="b">Option B</MenubarRadioItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(2);
  });

  it('renders label', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarLabel>Section</MenubarLabel>
            <MenubarItem>Item</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(screen.getByText('Section')).toBeInTheDocument();
  });

  it('renders separator', () => {
    const { container } = render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Item 1</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Item 2</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
  });

  it('renders shortcut', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              Save
              <MenubarShortcut>⌘S</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(screen.getByText('⌘S')).toBeInTheDocument();
  });

  it('renders inset menu item', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem inset>Indented Item</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    const item = screen.getByRole('menuitem', { name: 'Indented Item' });
    expect(item).toHaveClass('pl-8');
  });

  it('renders inset label', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarLabel inset>Section</MenubarLabel>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    const label = screen.getByText('Section');
    expect(label).toHaveClass('pl-8');
  });

  it('renders submenu', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarSub>
              <MenubarSubTrigger>Open Recent</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>File 1</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(screen.getByText('Open Recent')).toBeInTheDocument();
  });

  it('renders sub trigger with inset', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarSub>
              <MenubarSubTrigger inset>Indented Sub</MenubarSubTrigger>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    const trigger = screen.getByText('Indented Sub').closest('[role="menuitem"]');
    expect(trigger).toHaveClass('pl-8');
  });

  it('merges custom className on item', () => {
    render(
      <Menubar>
        <MenubarMenu open>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem className="custom-class">Item</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(screen.getByRole('menuitem', { name: 'Item' })).toHaveClass('custom-class');
  });

  it('merges custom className on trigger', () => {
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger className="font-bold">File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(screen.getByRole('menuitem', { name: 'File' })).toHaveClass('font-bold');
  });
});
