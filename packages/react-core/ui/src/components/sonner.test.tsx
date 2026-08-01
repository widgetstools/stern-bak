import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Toaster } from './sonner.js';

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

vi.mock('sonner', () => ({
  Toaster: ({
    theme,
    className,
  }: {
    theme?: string;
    className?: string;
  }) => <div className={className} data-theme={theme} data-testid="sonner-root" />,
}));

afterEach(cleanup);

describe('Sonner Toaster', () => {
  it('passes the active theme through to sonner', () => {
    render(<Toaster />);

    expect(screen.getByTestId('sonner-root')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByTestId('sonner-root')).toHaveClass('toaster', 'group');
  });
});
