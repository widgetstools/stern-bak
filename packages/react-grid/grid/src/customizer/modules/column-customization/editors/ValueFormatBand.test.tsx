import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/engine';
import { ValueFormatBand } from './ValueFormatBand';

describe('ValueFormatBand', () => {
  it('mounts compact FormatterPicker for the column', async () => {
    const onChange = vi.fn();
    render(
      <ValueFormatBand
        colId="price"
        cellDataType="number"
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('cols-price-fmt-trigger')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-price-fmt-trigger'));
    });
    expect(screen.getByTestId('cols-price-fmt')).toBeTruthy();
  });

  it('forwards picker onChange through the band handler', async () => {
    const onChange = vi.fn();
    render(
      <ValueFormatBand
        colId="px"
        cellDataType="number"
        value={undefined}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-px-fmt-trigger'));
    });
    await waitFor(() => expect(screen.getByTestId('cols-px-fmt-tab-custom')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-px-fmt-tab-custom'));
    });
    const excel = await screen.findByTestId('cols-px-fmt-excel');
    fireEvent.change(excel, { target: { value: '#,##0.00' } });
    fireEvent.keyDown(excel, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'excelFormat', format: '#,##0.00' }),
    );
  });

  it('filters presets via search in the band picker', async () => {
    render(
      <ValueFormatBand
        colId="qty"
        cellDataType="number"
        value={undefined}
        onChange={() => {}}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-qty-fmt-trigger'));
    });
    await waitFor(() => expect(screen.getByTestId('cols-qty-fmt-search')).toBeTruthy());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cols-qty-fmt-search'), { target: { value: 'decimal' } });
    });
    await waitFor(() => expect(screen.getByTestId('cols-qty-fmt-results')).toBeTruthy());
  });

  it('infers date data type from cellDataType', async () => {
    render(
      <ValueFormatBand
        colId="asof"
        cellDataType="dateString"
        value={undefined}
        onChange={() => {}}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-asof-fmt-trigger'));
    });
    expect(screen.getByTestId('cols-asof-fmt-tab-date')).toBeTruthy();
  });
});
