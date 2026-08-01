import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EditingToolbarApplyButton,
  EditingToolbarIconButton,
  EditingToolbarOpButton,
  EditingToolbarSegment,
  editingToolbarInputColumns,
  editingToolbarFieldWidthStyle,
} from './EditingToolbarPrimitives';

describe('EditingToolbarPrimitives', () => {
  it('renders segment with meta in standalone layout', () => {
    render(
      <EditingToolbarSegment label="Mode" layout="standalone" data-testid="seg" meta={<span>Hint</span>}>
        <span>Body</span>
      </EditingToolbarSegment>,
    );
    expect(screen.getByTestId('seg')).toBeInTheDocument();
    expect(screen.getByText('Hint')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('wires apply and icon buttons', () => {
    const onApply = vi.fn();
    const onIcon = vi.fn();
    render(
      <>
        <EditingToolbarApplyButton onClick={onApply} data-testid="apply" />
        <EditingToolbarIconButton aria-label="Help" onClick={onIcon} data-testid="icon">
          ?
        </EditingToolbarIconButton>
      </>,
    );
    fireEvent.click(screen.getByTestId('apply'));
    fireEvent.click(screen.getByTestId('icon'));
    expect(onApply).toHaveBeenCalled();
    expect(onIcon).toHaveBeenCalled();
  });

  it('renders label and symbol operation buttons', () => {
    render(
      <>
        <EditingToolbarOpButton data-testid="sym">×</EditingToolbarOpButton>
        <EditingToolbarOpButton opVariant="label" data-testid="lbl">Set…</EditingToolbarOpButton>
      </>,
    );
    expect(screen.getByTestId('sym')).toHaveTextContent('×');
    expect(screen.getByTestId('lbl')).toHaveTextContent('Set…');
  });

  it('computes field width helpers', () => {
    expect(editingToolbarInputColumns('12345')).toBe(5);
    expect(editingToolbarInputColumns('', { min: 6 })).toBe(6);
    expect(editingToolbarFieldWidthStyle(4)).toEqual({ '--ex-field-cols': 4 });
  });
});
