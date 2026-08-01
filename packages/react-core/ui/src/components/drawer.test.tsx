import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from './drawer.js';

afterEach(cleanup);

describe('Drawer', () => {
  it('opens in a portal and exposes title and description', async () => {
    render(
      <Drawer direction="right">
        <DrawerTrigger asChild>
          <button type="button">Open drawer</button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Column settings</DrawerTitle>
          <DrawerDescription>Adjust visibility and order.</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open drawer' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Column settings' })).toBeInTheDocument();
    expect(screen.getByText('Adjust visibility and order.')).toBeInTheDocument();
  });

  it('merges className on drawer content and can hide the handle', () => {
    render(
      <Drawer defaultOpen direction="right">
        <DrawerContent className="max-w-md" hideHandle>
          <DrawerTitle>Title</DrawerTitle>
        </DrawerContent>
      </Drawer>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-md');
  });
});
