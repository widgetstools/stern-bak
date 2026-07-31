import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminActionButtons, resolveAdminActionIcon } from './AdminActionButtons';
import { Wrench, Database } from 'lucide-react';

describe('AdminActionButtons', () => {
  it('renders nothing when actions are absent or all hidden', () => {
    const { container, rerender } = render(<AdminActionButtons actions={undefined} />);
    expect(container.firstChild).toBeNull();

    rerender(<AdminActionButtons actions={[{ id: 'x', label: 'X', onClick: vi.fn(), visible: false }]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders visible actions with accessible labels and invokes onClick', () => {
    const onClick = vi.fn();
    render(
      <AdminActionButtons
        actions={[
          {
            id: 'refresh',
            label: 'Refresh data',
            description: 'Pull latest snapshot',
            icon: 'lucide:refresh-cw',
            onClick,
          },
        ]}
      />,
    );

    const btn = screen.getByRole('button', { name: 'Refresh data' });
    expect(btn).toHaveAttribute('data-testid', 'admin-action-refresh');
    expect(btn).toHaveAttribute('title', 'Refresh data\nPull latest snapshot');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('resolveAdminActionIcon falls back to Wrench for unknown refs', () => {
    expect(resolveAdminActionIcon('lucide:database')).toBe(Database);
    expect(resolveAdminActionIcon('lucide:missing')).toBe(Wrench);
    expect(resolveAdminActionIcon(undefined)).toBe(Wrench);
  });
});
