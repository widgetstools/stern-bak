import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleContext } from './ModuleContext';
import { makeFormatterActions, makeFormatterState } from '../formatterTestHelpers';

describe('ModuleContext', () => {
  it('renders target and scope toggles', () => {
    render(<ModuleContext state={makeFormatterState()} actions={makeFormatterActions()} />);
    expect(screen.getByTestId('formatting-target-cell')).toBeInTheDocument();
    expect(screen.getByTestId('formatting-scope-selected')).toBeInTheDocument();
  });

  it('calls setTarget when header target selected', () => {
    const setTarget = vi.fn();
    render(
      <ModuleContext
        state={makeFormatterState()}
        actions={makeFormatterActions({ setTarget })}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId('formatting-target-header'));
    expect(setTarget).toHaveBeenCalledWith('header');
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
