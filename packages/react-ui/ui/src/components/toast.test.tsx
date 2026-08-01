import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast.js';

afterEach(cleanup);

function openToast(ui: React.ReactElement) {
  render(
    <ToastProvider>
      {ui}
      <ToastViewport />
    </ToastProvider>,
  );
}

describe('Toast', () => {
  it('opens in the viewport with title and description', () => {
    openToast(
      <Toast defaultOpen>
        <ToastTitle>Saved</ToastTitle>
        <ToastDescription>Your changes were saved.</ToastDescription>
      </Toast>,
    );

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your changes were saved.')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveAttribute('data-state', 'open');
  });

  it('renders distinct classes for default and destructive variants', () => {
    openToast(
      <Toast defaultOpen variant="default">
        <ToastTitle>Info</ToastTitle>
      </Toast>,
    );
    const defaultClass = screen.getByRole('listitem').className;

    cleanup();

    openToast(
      <Toast defaultOpen variant="destructive">
        <ToastTitle>Error</ToastTitle>
      </Toast>,
    );
    const destructiveClass = screen.getByRole('listitem').className;

    expect(defaultClass).not.toBe(destructiveClass);
    expect(destructiveClass).toContain('destructive');
  });

  it('fires the action callback and respects disabled actions', async () => {
    const onAction = vi.fn();
    openToast(
      <Toast defaultOpen>
        <ToastTitle>Retry</ToastTitle>
        <ToastAction altText="Try again" onClick={onAction}>
          Retry now
        </ToastAction>
      </Toast>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(onAction).toHaveBeenCalledTimes(1);

    cleanup();

    const onDisabledAction = vi.fn();
    openToast(
      <Toast defaultOpen>
        <ToastTitle>Locked</ToastTitle>
        <ToastAction altText="Try again" disabled onClick={onDisabledAction}>
          Retry now
        </ToastAction>
      </Toast>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(onDisabledAction).not.toHaveBeenCalled();
  });

  it('merges className on toast content and exposes a close control', () => {
    openToast(
      <Toast className="border-primary" defaultOpen>
        <ToastTitle>Closable</ToastTitle>
        <ToastClose aria-label="Dismiss toast" />
      </Toast>,
    );

    expect(screen.getByRole('listitem')).toHaveClass('border-primary');
    expect(screen.getByRole('button', { name: 'Dismiss toast' })).toBeInTheDocument();
  });
});
