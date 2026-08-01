import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnListItem } from './ColumnListItem';

describe('ColumnListItem', () => {
  it('forwards modifier keys on click and activates on double-click', () => {
    const onSelect = vi.fn();
    const onActivate = vi.fn();
    render(
      <ColumnListItem
        headerName="Price"
        colId="price"
        selected={false}
        locked={false}
        onSelect={onSelect}
        onActivate={onActivate}
      />,
    );

    fireEvent.click(screen.getByTestId('column-selector-item-price'), {
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
    });
    expect(onSelect).toHaveBeenCalledWith({ metaKey: true, ctrlKey: false, shiftKey: false });

    fireEvent.doubleClick(screen.getByTestId('column-selector-item-price'));
    expect(onActivate).toHaveBeenCalled();
  });

  it('shows drag handle and locked icon', () => {
    render(
      <ColumnListItem
        headerName="Qty"
        colId="qty"
        selected
        locked
        dragging
        onSelect={vi.fn()}
        onActivate={vi.fn()}
        dragHandleProps={{ 'aria-grabbed': true }}
      />,
    );
    expect(screen.getByLabelText('Drag to reorder')).toBeInTheDocument();
    expect(screen.getByLabelText('Locked')).toBeInTheDocument();
    expect(screen.getByTestId('column-selector-item-qty')).toHaveAttribute('aria-selected', 'true');
  });

  it('stops propagation on drag handle click', () => {
    const onSelect = vi.fn();
    render(
      <ColumnListItem
        headerName="Side"
        colId="side"
        selected={false}
        locked={false}
        onSelect={onSelect}
        onActivate={vi.fn()}
        dragHandleProps={{}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Drag to reorder'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
