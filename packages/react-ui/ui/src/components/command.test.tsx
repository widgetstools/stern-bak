import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command.js';

afterEach(cleanup);

describe('Command', () => {
  it('filters items and selects a result', async () => {
    const onSelect = vi.fn();
    render(
      <Command>
        <CommandInput placeholder="Search actions" />
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={onSelect}>Profile</CommandItem>
            <CommandItem disabled>Settings</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );

    await userEvent.type(screen.getByPlaceholderText('Search actions'), 'Pro');
    await userEvent.click(screen.getByRole('option', { name: 'Profile' }));

    expect(onSelect).toHaveBeenCalled();
  });

  it('marks disabled command items as aria-disabled', () => {
    render(
      <Command>
        <CommandList>
          <CommandItem disabled>Settings</CommandItem>
        </CommandList>
      </Command>,
    );

    expect(screen.getByRole('option', { name: 'Settings' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('opens inside a dialog and exposes the search field', () => {
    render(
      <CommandDialog defaultOpen>
        <CommandInput placeholder="Search commands" />
        <CommandList>
          <CommandItem>Reload data</CommandItem>
        </CommandList>
      </CommandDialog>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search commands')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Reload data' })).toBeInTheDocument();
  });

  it('merges className on the command root', () => {
    render(
      <Command className="border">
        <CommandList>
          <CommandItem>One</CommandItem>
        </CommandList>
      </Command>,
    );

    expect(screen.getByRole('option', { name: 'One' }).closest('[cmdk-root]')).toHaveClass('border');
  });
});
