import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from './navigation-menu.js';

afterEach(cleanup);

describe('NavigationMenu', () => {
  it('opens content when a trigger is activated', async () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/equities">Equities</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Products' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Equities' })).toBeVisible();
    });
    expect(screen.getByRole('button', { name: 'Products' })).toHaveAttribute('data-state', 'open');
  });

  it('does not activate a disabled trigger', async () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger disabled>Locked</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/hidden">Hidden</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Locked' }));

    expect(screen.getByRole('button', { name: 'Locked' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Hidden' })).not.toBeInTheDocument();
  });

  it('merges className on the navigation root', () => {
    render(
      <NavigationMenu className="w-full">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/home">Home</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    expect(screen.getByRole('navigation')).toHaveClass('w-full');
  });
});
