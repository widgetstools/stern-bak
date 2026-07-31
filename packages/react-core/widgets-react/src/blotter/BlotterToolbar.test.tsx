import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlotterToolbar } from './BlotterToolbar.js';

const widget = { isLoading: true } as never;

describe('BlotterToolbar', () => {
  it('fires custom actions and shows loading state', async () => {
    const user = userEvent.setup();
    const onCustomAction = vi.fn();
    render(
      <BlotterToolbar
        widget={widget}
        layouts={[]}
        activeLayoutId={null}
        onSelectLayout={vi.fn()}
        onSaveLayout={vi.fn()}
        customButtons={[{ id: 'b1', label: 'Export', actionId: 'export' }]}
        onCustomAction={onCustomAction}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(onCustomAction).toHaveBeenCalledWith('export');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
  });
});
