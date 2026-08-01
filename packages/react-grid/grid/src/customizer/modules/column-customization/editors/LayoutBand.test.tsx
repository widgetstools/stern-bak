import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LayoutBand } from './LayoutBand';
import { pickNativeSelect } from '../../../test/selectHelpers';

describe('LayoutBand', () => {
  it('patches initialWidth via IconInput commit', () => {
    const setDraft = vi.fn();
    render(
      <LayoutBand
        colId="price"
        initialWidth={undefined}
        initialPinned={undefined}
        initialHide={undefined}
        sortable={undefined}
        resizable={undefined}
        setDraft={setDraft}
      />,
    );
    const width = screen.getByTestId('cols-price-width');
    fireEvent.change(width, { target: { value: '120' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    expect(setDraft).toHaveBeenCalledWith({ initialWidth: 120 });
  });

  it('clears width when input emptied', () => {
    const setDraft = vi.fn();
    render(
      <LayoutBand
        colId="price"
        initialWidth={100}
        initialPinned={undefined}
        initialHide={undefined}
        sortable={undefined}
        resizable={undefined}
        setDraft={setDraft}
      />,
    );
    const width = screen.getByTestId('cols-price-width');
    fireEvent.change(width, { target: { value: '' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    expect(setDraft).toHaveBeenCalledWith({ initialWidth: undefined });
  });

  it('sets pinned left right and off', async () => {
    const setDraft = vi.fn();
    const { rerender } = render(
      <LayoutBand
        colId="price"
        initialWidth={undefined}
        initialPinned={undefined}
        initialHide={undefined}
        sortable={undefined}
        resizable={undefined}
        setDraft={setDraft}
      />,
    );
    await pickNativeSelect('cols-price-pinned', 'Pinned left');
    expect(setDraft).toHaveBeenCalledWith({ initialPinned: 'left' });

    rerender(
      <LayoutBand
        colId="price"
        initialWidth={undefined}
        initialPinned="left"
        initialHide={undefined}
        sortable={undefined}
        resizable={undefined}
        setDraft={setDraft}
      />,
    );
    await pickNativeSelect('cols-price-pinned', 'Pinned right');
    expect(setDraft).toHaveBeenCalledWith({ initialPinned: 'right' });

    rerender(
      <LayoutBand
        colId="price"
        initialWidth={undefined}
        initialPinned="right"
        initialHide={undefined}
        sortable={undefined}
        resizable={undefined}
        setDraft={setDraft}
      />,
    );
    await pickNativeSelect('cols-price-pinned', 'Off');
    expect(setDraft).toHaveBeenCalledWith({ initialPinned: undefined });
  });

  it('toggles initial hide and tri-state sortable/resizable', async () => {
    const setDraft = vi.fn();
    render(
      <LayoutBand
        colId="qty"
        initialWidth={undefined}
        initialPinned={undefined}
        initialHide={false}
        sortable={undefined}
        resizable={undefined}
        setDraft={setDraft}
      />,
    );
    fireEvent.click(screen.getByTestId('cols-qty-hide'));
    expect(setDraft).toHaveBeenCalledWith({ initialHide: true });

    setDraft.mockClear();
    await pickNativeSelect('cols-qty-sortable', 'On');
    expect(setDraft).toHaveBeenCalledWith({ sortable: true });

    setDraft.mockClear();
    await pickNativeSelect('cols-qty-resizable', 'Off');
    expect(setDraft).toHaveBeenCalledWith({ resizable: false });
  });
});
