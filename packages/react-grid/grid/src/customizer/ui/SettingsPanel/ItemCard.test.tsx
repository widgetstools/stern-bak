import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ItemCard } from './ItemCard';

describe('ItemCard', () => {
  it('reflects dirty state and enables SAVE only when dirty', () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <ItemCard title="Rule A" dirty={false} onSave={onSave} data-testid-save="save-btn">
        body
      </ItemCard>,
    );
    const save = screen.getByTestId('save-btn');
    expect(save).toBeDisabled();

    rerender(
      <ItemCard title="Rule A" dirty onSave={onSave} data-testid-save="save-btn">
        body
      </ItemCard>,
    );
    expect(screen.getByTestId('save-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('save-btn'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('hides body when collapsed and toggles via chevron', () => {
    const onToggle = vi.fn();
    render(
      <ItemCard title="Band" collapsed onToggleCollapsed={onToggle} data-testid="card">
        <div data-testid="body">content</div>
      </ItemCard>,
    );
    expect(screen.queryByTestId('body')).toBeNull();
    expect(screen.getByTestId('card').getAttribute('data-collapsed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('fires onDelete from trash affordance', () => {
    const onDelete = vi.fn();
    render(
      <ItemCard title="X" onDelete={onDelete}>
        body
      </ItemCard>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
