import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleContext } from './ModuleContext';
import { makeFormatterActions, makeFormatterState } from '../formatterTestHelpers';

describe('ModuleContext', () => {
  it('renders target and scope as one button each, showing the state they are in', () => {
    render(<ModuleContext state={makeFormatterState()} actions={makeFormatterActions()} />);
    const target = screen.getByTestId('formatting-target-toggle');
    const scope = screen.getByTestId('formatting-scope-toggle');
    expect(target).toHaveAttribute('data-value', 'cell');
    expect(target).toHaveTextContent('Cells');
    expect(scope).toHaveAttribute('data-value', 'selected');
    expect(scope).toHaveTextContent('Selected');
    // Only one button per decision — the other option is not also on screen.
    expect(screen.queryByText('Headers')).toBeNull();
  });

  it('flips target to the other value on click', () => {
    const setTarget = vi.fn();
    render(
      <ModuleContext
        state={makeFormatterState()}
        actions={makeFormatterActions({ setTarget })}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId('formatting-target-toggle'));
    expect(setTarget).toHaveBeenCalledWith('header');
  });

  it('flips back, and only highlights the non-default state', () => {
    const setTarget = vi.fn();
    render(
      <ModuleContext
        state={makeFormatterState({ target: 'header' })}
        actions={makeFormatterActions({ setTarget })}
      />,
    );
    const target = screen.getByTestId('formatting-target-toggle');
    expect(target).toHaveAttribute('data-value', 'header');
    expect(target).toHaveAttribute('data-on', 'true');
    fireEvent.mouseDown(target);
    expect(setTarget).toHaveBeenCalledWith('cell');
  });

  it('inline-renames column when single column selected', async () => {
    const user = userEvent.setup();
    const setHeaderName = vi.fn();
    render(
      <ModuleContext
        state={makeFormatterState({ singleColumnSelected: true, colLabel: 'Price' })}
        actions={makeFormatterActions({ setHeaderName })}
      />,
    );
    await user.click(screen.getByTestId('formatting-col-label'));
    const input = screen.getByTestId('formatting-col-label-input');
    await user.clear(input);
    await user.type(input, 'Notional{Enter}');
    expect(setHeaderName).toHaveBeenCalledWith('Notional');
  });

  it('toggles header case and cell tooltips pills', () => {
    const toggleHeaderCaseUppercase = vi.fn();
    const toggleCellTooltips = vi.fn();
    render(
      <ModuleContext
        state={makeFormatterState()}
        actions={makeFormatterActions({ toggleHeaderCaseUppercase, toggleCellTooltips })}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId('formatting-toggle-header-case'));
    fireEvent.mouseDown(screen.getByTestId('formatting-toggle-cell-tooltips'));
    expect(toggleHeaderCaseUppercase).toHaveBeenCalled();
    expect(toggleCellTooltips).toHaveBeenCalled();
  });

  it('undo/redo pills respect canUndo/canRedo', () => {
    const undo = vi.fn();
    render(
      <ModuleContext
        state={makeFormatterState({ canUndo: true })}
        actions={makeFormatterActions({ undo })}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId('formatting-undo'));
    expect(undo).toHaveBeenCalled();
  });
});
