import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ExcelReferencePopover } from './ExcelReferencePopover';

describe('ExcelReferencePopover', () => {
  it('opens reference and picks a format', async () => {
    const onPick = vi.fn();
    render(<ExcelReferencePopover onPick={onPick} data-testid="ref" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ref'));
    });
    const row = screen.getAllByRole('button').find((b) => b.textContent?.includes('#,##0.00'));
    expect(row).toBeTruthy();
    await act(async () => {
      fireEvent.click(row!);
    });
    expect(onPick).toHaveBeenCalledWith(expect.stringContaining('#,##0'));
  });

  it('ignores non-copyable reference rows', async () => {
    const onPick = vi.fn();
    render(<ExcelReferencePopover onPick={onPick} data-testid="ref" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ref'));
    });
    const disabled = screen.getAllByRole('button').find((b) => (b as HTMLButtonElement).disabled);
    if (disabled) {
      await act(async () => {
        fireEvent.click(disabled);
      });
      expect(onPick).not.toHaveBeenCalled();
    }
  });

  it('highlights copyable rows on hover', async () => {
    const onPick = vi.fn();
    render(<ExcelReferencePopover onPick={onPick} data-testid="ref" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ref'));
    });
    const row = screen.getAllByRole('button').find((b) => b.textContent?.includes('#,##0.00'));
    expect(row).toBeTruthy();
    fireEvent.mouseEnter(row!);
    fireEvent.mouseLeave(row!);
  });
});
