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
