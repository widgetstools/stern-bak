import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Palette, type PaletteItem } from './Palette';

const ITEMS: PaletteItem[] = [
  { id: 'price', label: 'Price', detail: 'number', keywords: ['px'] },
  { id: 'side', label: 'Side', detail: 'string' },
  { id: 'qty', label: 'Quantity', group: 'Size' },
];

describe('Palette', () => {
  it('filters items by query', () => {
    render(
      <Palette
        title="Columns"
        placeholder="Filter…"
        items={ITEMS}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'price' } });
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.queryByText('Side')).toBeNull();
  });

  it('invokes onPick on Enter for selected row', () => {
    const onPick = vi.fn();
    render(
      <Palette
        title="Columns"
        placeholder="Filter…"
        items={ITEMS}
        onPick={onPick}
        onClose={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'price' }));
  });

  it('invokes onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Palette
        title="Columns"
        placeholder="Filter…"
        items={ITEMS}
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
