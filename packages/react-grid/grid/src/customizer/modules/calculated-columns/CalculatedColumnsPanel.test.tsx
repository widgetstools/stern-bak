/**
 * Integration tests for the v4 CalculatedColumnsPanel rewrite.
 *
 * Covers:
 *  - `CalculatedColumnsList`: render, add button, auto-select-first, LED
 *    lighting via the per-platform DirtyBus (NOT via the old window event).
 *  - `CalculatedColumnsEditor`: empty-state, delete, memoised editor
 *    identity.
 *  - `VirtualColumnEditor`: header rename / expression / formatter round-
 *    trip through `useModuleDraft`, SAVE commits to module state,
 *    dirty-bus integration.
 *
 * Mounts the full module (`calculatedColumnsModule`) so we're testing
 * the same surface the settings sheet would render.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import {
  CalculatedColumnsEditor,
  CalculatedColumnsList,
  CalculatedColumnsPanel,
} from './CalculatedColumnsPanel';
import { calculatedColumnsModule } from './index';
import type { CalculatedColumnsState } from '@wellsfargo-starui/core';

function makePlatform() {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [calculatedColumnsModule] });
  // The module no longer ships a `grossPnl` seed by default — production
  // grids start with zero virtual columns. The tests below were written
  // against the old seed so we re-introduce it as a TEST FIXTURE here.
  // Each test still exercises the same UI semantics; only the source of
  // the seed moved from prod code to test setup.
  platform.store.setModuleState<CalculatedColumnsState>('calculated-columns', () => ({
    virtualColumns: [{
      colId: 'grossPnl',
      headerName: 'Gross P&L',
      expression: '[price] * [quantity] / 1000',
      position: 20,
      initialWidth: 120,
    }],
  }));
  return platform;
}

function MasterDetail({ platform }: { platform: GridPlatform }) {
  // Minimal controlled host that mimics the settings sheet's ListPane +
  // EditorPane wiring — state for `selectedId` lives outside both panes.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  return (
    <GridProvider platform={platform}>
      <CalculatedColumnsList gridId="test-grid" selectedId={selectedId} onSelect={setSelectedId} />
      <CalculatedColumnsEditor gridId="test-grid" selectedId={selectedId} />
    </GridProvider>
  );
}

// React must be in scope for the tiny local host component above. Imported
// as a namespace so we don't pull a default when the module shape shifts.
import * as React from 'react';

describe('CalculatedColumnsPanel (v4)', () => {
  let platform: GridPlatform;
  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => { platform = makePlatform(); });
  afterEach(cleanup);

  // ─── List pane ─────────────────────────────────────────────────────

  it('renders the seeded virtual column and the add button', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('cc-add-virtual-btn')).toBeTruthy();
    // Seed from the module: one virtual column `grossPnl`.
    expect(screen.getByTestId('cc-virtual-grossPnl')).toBeTruthy();
  });

  it('auto-selects the first virtual column when the pane mounts', () => {
    render(<MasterDetail platform={platform} />);
    // Editor for grossPnl should be on screen — proves the list fired
    // onSelect for the first item.
    expect(screen.getByTestId('cc-virtual-editor-grossPnl')).toBeTruthy();
  });

  it('ADD creates a new virtual column and selects it', () => {
    render(<MasterDetail platform={platform} />);
    const before = platform.store.getModuleState<CalculatedColumnsState>(
      'calculated-columns',
    ).virtualColumns.length;

    act(() => screen.getByTestId('cc-add-virtual-btn').click());

    const after = platform.store.getModuleState<CalculatedColumnsState>(
      'calculated-columns',
    ).virtualColumns.length;
    expect(after).toBe(before + 1);

    // The new column's editor is now mounted — find any element with a
    // testId of the form `cc-virtual-editor-vcol_*`.
    const editor = document.querySelector('[data-testid^="cc-virtual-editor-vcol_"]');
    expect(editor).toBeTruthy();
  });

  // ─── Editor pane ───────────────────────────────────────────────────

  it('DELETE removes the selected column directly from the list item', () => {
    render(
      <GridProvider platform={platform}>
        <CalculatedColumnsList
          gridId="test-grid"
          selectedId={null}
          onSelect={() => {}}
        />
      </GridProvider>,
    );
    expect(screen.queryByTestId('cc-virtual-editor-grossPnl')).toBeNull();

    act(() => screen.getByTestId('cc-virtual-delete-grossPnl').click());

    const cols = platform.store.getModuleState<CalculatedColumnsState>(
      'calculated-columns',
    ).virtualColumns;
    expect(cols.find((c) => c.colId === 'grossPnl')).toBeUndefined();
  });

  // ─── Draft / SAVE / dirty-bus ──────────────────────────────────────

  it('editing header name marks the draft dirty WITHOUT touching module state', () => {
    render(<MasterDetail platform={platform} />);
    const header = screen.getByTestId('cc-virtual-header-grossPnl') as HTMLInputElement;

    fireEvent.change(header, { target: { value: 'Gross P&L v2' } });

    // Local draft reflects.
    expect(header.value).toBe('Gross P&L v2');
    // Module state unchanged.
    expect(
      platform.store.getModuleState<CalculatedColumnsState>('calculated-columns')
        .virtualColumns.find((c) => c.colId === 'grossPnl')!.headerName,
    ).toBe('Gross P&L');
    // SAVE enabled.
    expect((screen.getByTestId('cc-virtual-save-grossPnl') as HTMLButtonElement).disabled).toBe(false);
  });

  it('RESET discards unsaved column edits without closing the editor', () => {
    render(<MasterDetail platform={platform} />);
    const header = screen.getByTestId('cc-virtual-header-grossPnl') as HTMLInputElement;

    fireEvent.change(header, { target: { value: 'Unsaved Column' } });
    expect(platform.resources.dirty().isDirty('calculated-columns:grossPnl')).toBe(true);

    act(() => screen.getByTestId('cc-virtual-reset-grossPnl').click());

    expect(header.value).toBe('Gross P&L');
    expect(platform.resources.dirty().isDirty('calculated-columns:grossPnl')).toBe(false);
    expect(screen.getByTestId('cc-virtual-editor-grossPnl')).toBeTruthy();
    expect(
      platform.store.getModuleState<CalculatedColumnsState>('calculated-columns')
        .virtualColumns.find((c) => c.colId === 'grossPnl')!.headerName,
    ).toBe('Gross P&L');
  });

  it('dirty state registers on the per-platform DirtyBus under `calculated-columns:<colId>`', () => {
    render(<MasterDetail platform={platform} />);
    const header = screen.getByTestId('cc-virtual-header-grossPnl') as HTMLInputElement;

    expect(platform.resources.dirty().isDirty('calculated-columns:grossPnl')).toBe(false);

    fireEvent.change(header, { target: { value: 'Gross P&L v2' } });
    expect(platform.resources.dirty().isDirty('calculated-columns:grossPnl')).toBe(true);
  });

  it('SAVE commits the draft into module state and clears dirty', () => {
    render(<MasterDetail platform={platform} />);
    const header = screen.getByTestId('cc-virtual-header-grossPnl') as HTMLInputElement;
    fireEvent.change(header, { target: { value: 'Committed Name' } });

    act(() => screen.getByTestId('cc-virtual-save-grossPnl').click());

    expect(
      platform.store.getModuleState<CalculatedColumnsState>('calculated-columns')
        .virtualColumns.find((c) => c.colId === 'grossPnl')!.headerName,
    ).toBe('Committed Name');
    expect(platform.resources.dirty().isDirty('calculated-columns:grossPnl')).toBe(false);
  });

  it('empty-state renders when no column is selected', () => {
    // Mount the editor alone with selectedId=null so nothing is picked.
    render(
      <GridProvider platform={platform}>
        <CalculatedColumnsEditor gridId="test-grid" selectedId={null} />
      </GridProvider>,
    );
    expect(screen.getByText(/No column selected/i)).toBeTruthy();
  });

  it('DELETE selects the next column when the active one is removed', () => {
    const onSelect = vi.fn();
    platform.store.setModuleState<CalculatedColumnsState>('calculated-columns', (s) => ({
      ...s,
      virtualColumns: [
        ...s.virtualColumns,
        {
          colId: 'netPnl',
          headerName: 'Net P&L',
          expression: '[price]',
          position: 21,
        },
      ],
    }));
    render(
      <GridProvider platform={platform}>
        <CalculatedColumnsList gridId="test-grid" selectedId="grossPnl" onSelect={onSelect} />
      </GridProvider>,
    );
    act(() => screen.getByTestId('cc-virtual-delete-grossPnl').click());
    expect(onSelect).toHaveBeenCalledWith('netPnl');
  });

  it('editor returns null for a missing selected column', () => {
    render(
      <GridProvider platform={platform}>
        <CalculatedColumnsEditor gridId="test-grid" selectedId="missing-col" />
      </GridProvider>,
    );
    expect(screen.queryByTestId(/cc-virtual-editor-/)).toBeNull();
  });

  it('edits expression, formatter, and column id in the virtual editor', () => {
    render(<MasterDetail platform={platform} />);
    fireEvent.change(screen.getByTestId('cc-virtual-expr-grossPnl'), {
      target: { value: '[price] + [quantity]' },
    });
    fireEvent.change(screen.getByTestId('cc-virtual-colid-grossPnl'), {
      target: { value: 'grossPnlRenamed' },
    });
    fireEvent.keyDown(screen.getByTestId('cc-virtual-colid-grossPnl'), { key: 'Enter' });

    expect((screen.getByTestId('cc-virtual-expr-grossPnl') as HTMLTextAreaElement).value).toBe(
      '[price] + [quantity]',
    );
    expect((screen.getByTestId('cc-virtual-colid-grossPnl') as HTMLInputElement).value).toBe(
      'grossPnlRenamed',
    );
  });

  it('renders legacy CalculatedColumnsPanel shell', () => {
    render(
      <GridProvider platform={platform}>
        <CalculatedColumnsPanel />
      </GridProvider>,
    );
    expect(screen.getByTestId('cc-panel')).toBeTruthy();
  });
});
