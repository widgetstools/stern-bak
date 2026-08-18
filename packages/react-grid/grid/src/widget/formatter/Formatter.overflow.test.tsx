/**
 * The ⋯ overflow menu. `Formatter.test.tsx` covers the toolbar with nothing
 * collapsed, which is what jsdom's unmeasured container always produces —
 * so this file substitutes the measurement hook to put the toolbar in the
 * state a narrow grid puts it in.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { FormatterToolbar } from './Formatter';
import { makeFormatterActions, makeFormatterState } from './formatterTestHelpers';

const hidden = { current: new Set<string>() };

vi.mock('./toolbarOverflow', () => ({
  useToolbarOverflow: () => ({
    containerRef: { current: null },
    leadRef: { current: null },
    trailRef: { current: null },
    registerSegment: () => () => undefined,
    hidden: hidden.current,
  }),
}));

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

function renderToolbar() {
  return render(
    <FormatterToolbar state={makeFormatterState()} actions={makeFormatterActions()} />,
  );
}

beforeEach(() => {
  hidden.current = new Set();
});

describe('FormatterToolbar — overflow', () => {
  it('shows no trigger while every segment fits', () => {
    renderToolbar();
    expect(screen.queryByTestId('formatting-overflow-trigger')).toBeNull();
  });

  it('shows the trigger once anything is collapsed', () => {
    hidden.current = new Set(['templates']);
    renderToolbar();

    expect(screen.getByTestId('formatting-overflow-trigger')).toBeInTheDocument();
  });

  it('takes the collapsed segment out of the row', () => {
    hidden.current = new Set(['templates']);
    renderToolbar();

    expect(screen.queryByTestId('fmt-seg-templates')).toBeNull();
    expect(screen.getByTestId('fmt-seg-font')).toBeInTheDocument();
  });

  it('puts every collapsed segment in the menu, labelled', async () => {
    const user = userEvent.setup();
    hidden.current = new Set(['templates', 'font']);
    renderToolbar();

    await user.click(screen.getByTestId('formatting-overflow-trigger'));
    const menu = screen.getByTestId('formatting-overflow-menu');

    expect(menu.querySelector('[data-seg="templates"]')).not.toBeNull();
    expect(menu.querySelector('[data-seg="font"]')).not.toBeNull();
    expect(menu.textContent).toContain('Font');
  });

  it('renders the collapsed segment content, not a placeholder', async () => {
    const user = userEvent.setup();
    hidden.current = new Set(['font']);
    renderToolbar();

    await user.click(screen.getByTestId('formatting-overflow-trigger'));
    // The same nodes the inline row would have shown — one implementation,
    // two placements.
    expect(screen.getByTestId('cluster-emphasis')).toBeInTheDocument();
  });

  it('keeps the grid cell when the trigger is pressed', () => {
    hidden.current = new Set(['templates']);
    renderToolbar();

    expect(fireEvent.mouseDown(screen.getByTestId('formatting-overflow-trigger'))).toBe(false);
  });

  it('eats mousedown on the menu chrome but not on form controls', async () => {
    const user = userEvent.setup();
    hidden.current = new Set(['templates']);
    renderToolbar();
    await user.click(screen.getByTestId('formatting-overflow-trigger'));
    const menu = screen.getByTestId('formatting-overflow-menu');

    expect(fireEvent.mouseDown(menu)).toBe(false);
    for (const tag of ['input', 'select', 'option', 'textarea']) {
      const el = document.createElement(tag);
      menu.appendChild(el);
      expect(fireEvent.mouseDown(el)).toBe(true);
      el.remove();
    }
  });
});
