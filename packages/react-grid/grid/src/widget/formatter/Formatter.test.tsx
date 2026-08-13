import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormatterPanel, FormatterToolbar } from './Formatter';
import { makeFormatterActions, makeFormatterState } from './formatterTestHelpers';

vi.mock('./modules/ModuleContext', () => ({
  ModuleContext: () => <div data-testid="module-context" />,
  TargetScopeCluster: () => <div data-testid="cluster-target-scope" />,
  ColumnCaptionCluster: () => <div data-testid="cluster-caption" />,
  EditableToggle: () => <div data-testid="cluster-editable" />,
  GridTogglesCluster: () => <div data-testid="cluster-grid-toggles" />,
  HistoryCluster: () => <div data-testid="cluster-history" />,
}));
vi.mock('./modules/ModuleType', () => ({
  ModuleType: () => <div data-testid="module-type" />,
  TypeEmphasisCluster: () => <div data-testid="cluster-emphasis" />,
  AlignCluster: () => <div data-testid="cluster-align" />,
  FontSizeSelect: () => <div data-testid="cluster-font-size" />,
}));
vi.mock('./modules/ModulePaint', () => ({
  ModulePaint: () => <div data-testid="module-paint" />,
  ColorCluster: () => <div data-testid="cluster-colors" />,
  BordersControl: () => <div data-testid="cluster-borders" />,
}));
vi.mock('./modules/ModuleFormat', () => ({
  ModuleFormat: () => <div data-testid="module-format" />,
  FormatCluster: () => <div data-testid="cluster-format" />,
}));
vi.mock('./modules/ModuleEditorFilter', () => ({
  ModuleEditorFilter: () => <div data-testid="module-editor-filter" />,
  EditorFilterCluster: () => <div data-testid="cluster-editor-filter" />,
}));
vi.mock('./modules/ModuleLibrary', () => ({
  ModuleLibrary: () => <div data-testid="module-library" />,
  TemplatesControl: () => <div data-testid="cluster-templates" />,
}));
vi.mock('./modules/ModuleClear', () => ({
  ModuleClear: () => <div data-testid="module-clear" />,
}));
vi.mock('./modules/ColumnMenu', () => ({
  ColumnMenuControl: () => <div data-testid="cluster-column-menu" />,
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

  it('renders every segment inline when the container is unmeasured (jsdom)', () => {
    render(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
      />,
    );
    for (const seg of ['font', 'number', 'align', 'borders', 'column', 'templates', 'history', 'clear']) {
      expect(screen.getByTestId(`fmt-seg-${seg}`)).toBeInTheDocument();
    }
    // No overflow trigger while everything fits.
    expect(screen.queryByTestId('formatting-overflow-trigger')).toBeNull();
  });

  it('pins Templates, undo/redo, and clear as the last segments, after the readout', () => {
    render(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
      />,
    );
    const segs = [...document.querySelectorAll('.fx-segment')].map(
      (el) => el.getAttribute('data-seg'),
    );
    expect(segs.slice(-3)).toEqual(['templates', 'history', 'clear']);
    const spring = document.querySelector('.fx-bar__spring')!;
    const templates = screen.getByTestId('fmt-seg-templates');
    // The spring spacer precedes the tail in DOM order — the tail hugs
    // the row's right edge.
    expect(
      spring.compareDocumentPosition(templates) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders a close button only when onClose is provided, and wires it', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.queryByTestId('formatting-close')).toBeNull();

    rerender(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
        onClose={onClose}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId('formatting-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prevents default mousedown except on form controls', () => {
    render(
      <FormatterToolbar
        state={makeFormatterState()}
        actions={makeFormatterActions()}
      />,
    );
    const shell = screen.getByTestId('formatting-toolbar');
    const innerDiv = shell.querySelector('.fx-bar') as HTMLElement;
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
