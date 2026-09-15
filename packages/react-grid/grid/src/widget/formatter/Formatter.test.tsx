import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormatterPanel, FormatterToolbar } from './Formatter';
import { makeFormatterActions, makeFormatterState } from './formatterTestHelpers';

vi.mock('./modules/ModuleContext', () => ({
  ModuleContext: () => <div data-testid="module-context" />,
}));
vi.mock('./modules/ModuleType', () => ({
  ModuleType: () => <div data-testid="module-type" />,
}));
vi.mock('./modules/ModulePaint', () => ({
  ModulePaint: () => <div data-testid="module-paint" />,
}));
vi.mock('./modules/ModuleFormat', () => ({
  ModuleFormat: () => <div data-testid="module-format" />,
}));
vi.mock('./modules/ModuleEditorFilter', () => ({
  ModuleEditorFilter: () => <div data-testid="module-editor-filter" />,
}));
vi.mock('./modules/ModuleLibrary', () => ({
  ModuleLibrary: () => <div data-testid="module-library" />,
}));
vi.mock('./modules/ModuleClear', () => ({
  ModuleClear: () => <div data-testid="module-clear" />,
}));

describe('FormatterToolbar', () => {
  it('renders horizontal shell and optional popout slot', () => {
    render(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
        popoutSlot={<button type="button">Pop out</button>}
      />,
    );
    expect(screen.getByTestId('formatting-toolbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pop out' })).toBeInTheDocument();
  });

  it('puts the pop-out and the hide button in a View group at the end of the ribbon', () => {
    // The pop-out used to be a sibling of the rows, positioned absolutely
    // and centred on the shell — on a wrapped ribbon that placed it in the
    // seam between the lines. As a group it shares the band with Clear.
    render(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
        popoutSlot={<button type="button" data-testid="popout" />}
        onHide={() => {}}
      />,
    );
    const view = screen.getByTestId('fmt-group-view');
    expect(view).toContainElement(screen.getByTestId('popout'));
    expect(view).toContainElement(screen.getByTestId('formatting-hide-btn'));
    // Inside the ribbon row, immediately after Clear.
    const row = screen.getByTestId('fmt-group-clear').parentElement;
    expect(row).toContainElement(view);
    expect(screen.getByTestId('fmt-group-clear').nextElementSibling).toBe(view);
  });

  it('calls onHide when the hide button is clicked, and omits it when not hideable', () => {
    const onHide = vi.fn();
    const { rerender } = render(
      <FormatterToolbar state={makeFormatterState()} actions={makeFormatterActions()} onHide={onHide} />,
    );
    fireEvent.click(screen.getByTestId('formatting-hide-btn'));
    expect(onHide).toHaveBeenCalledTimes(1);

    rerender(<FormatterToolbar state={makeFormatterState()} actions={makeFormatterActions()} />);
    expect(screen.queryByTestId('formatting-hide-btn')).toBeNull();
    expect(screen.queryByTestId('fmt-group-view')).toBeNull();
  });

  it('prevents default mousedown except on form controls', () => {
    render(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
      />,
    );
    const shell = screen.getByTestId('formatting-toolbar');
    const innerDiv = shell.querySelector('.fx-toolbar-rows') as HTMLElement;
    expect(fireEvent.mouseDown(innerDiv)).toBe(false);

    const input = document.createElement('input');
    shell.appendChild(input);
    expect(fireEvent.mouseDown(input)).toBe(true);
  });
});

describe('FormatterPanel', () => {
  it('renders vertical panel without title bar when not frameless', () => {
    render(
      <FormatterPanel
        state={makeFormatterState()}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByTestId('formatting-properties-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('fmt-panel-titlebar')).toBeNull();
  });

  it('renders frameless title bar and wires close', () => {
    const onClose = vi.fn();
    render(
      <FormatterPanel
        state={makeFormatterState()}
        actions={makeFormatterActions()}
        frameless
        titleText="Formatting — grid-1"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('fmt-panel-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
