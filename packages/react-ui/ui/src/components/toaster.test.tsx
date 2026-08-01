import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

afterEach(cleanup);

describe('Toaster', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders toast content pushed through useToast', async () => {
    const { toast } = await import('./use-toast.js');
    const { Toaster } = await import('./toaster.js');
    render(<Toaster />);

    act(() => {
      toast({ title: 'Saved', description: 'Your profile was updated.' });
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your profile was updated.')).toBeInTheDocument();
  });
});
