import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HeaderBand } from './HeaderBand';

function commitIconInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('HeaderBand', () => {
  it('renders read-only column id', () => {
    render(
      <HeaderBand
        colId="price"
        hostHeaderName="Price"
        headerName={undefined}
        headerTooltip={undefined}
        setDraft={() => {}}
      />,
    );
    expect(screen.getByTestId('cols-price-col-id')).toHaveTextContent('price');
  });

  it('commits header name and clears blank override', () => {
    const setDraft = vi.fn();
    render(
      <HeaderBand
        colId="price"
        hostHeaderName="Price"
        headerName={undefined}
        headerTooltip={undefined}
        setDraft={setDraft}
      />,
    );
    commitIconInput(screen.getByTestId('cols-price-header-name'), 'Bid Price');
    expect(setDraft).toHaveBeenCalledWith({ headerName: 'Bid Price' });

    setDraft.mockClear();
    commitIconInput(screen.getByTestId('cols-price-header-name'), '   ');
    expect(setDraft).toHaveBeenCalledWith({ headerName: undefined });
  });

  it('commits tooltip and clears blank value', () => {
    const setDraft = vi.fn();
    render(
      <HeaderBand
        colId="qty"
        hostHeaderName="Quantity"
        headerName="Qty"
        headerTooltip="Lots"
        setDraft={setDraft}
      />,
    );
    commitIconInput(screen.getByTestId('cols-qty-header-tooltip'), 'Shares');
    expect(setDraft).toHaveBeenCalledWith({ headerTooltip: 'Shares' });

    setDraft.mockClear();
    commitIconInput(screen.getByTestId('cols-qty-header-tooltip'), '');
    expect(setDraft).toHaveBeenCalledWith({ headerTooltip: undefined });
  });
});
